/**
 * Magic Pixel - 批量处理器模块
 *
 * 管理多图片批量处理
 */

const BatchProcessor = {
    // 图片项列表
    _items: [],

    // 当前选中索引
    _currentIndex: -1,

    // 全局配置（应用于所有图片）
    _globalConfig: {
        autoDetect: true,        // 自动检测背景色
        tolerance: 30,
        edgeFeather: 2,
        outputFormat: 'png',
        backgroundColor: null    // 填充背景色（null=透明）
    },

    // 回调
    _callbacks: {
        itemAdd: [],
        itemRemove: [],
        itemSelect: [],
        itemProcess: [],
        itemUpdate: [],
        progress: [],
        allProcessed: []
    },

    /**
     * 添加图片
     * @param {File} file - 图片文件
     * @returns {Promise<Object>} 图片项对象
     */
    async addImage(file) {
        try {
            // 读取文件
            const dataUrl = await this._readFileAsDataUrl(file);
            const image = await this._loadImage(dataUrl);

            // 创建Canvas
            const canvas = CanvasUtils.createCanvas(image.width, image.height);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);

            // 创建蒙版Canvas（初始为全白，完全不透明）
            const maskCanvas = CanvasUtils.createCanvas(image.width, image.height);
            const maskCtx = maskCanvas.getContext('2d');
            maskCtx.fillStyle = 'white';
            maskCtx.fillRect(0, 0, image.width, image.height);

            // 创建项对象
            const item = {
                id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                file: file,
                name: file.name,
                width: image.width,
                height: image.height,
                size: file.size,

                // Canvas引用
                originalCanvas: canvas,
                processedCanvas: null,
                maskCanvas: maskCanvas,

                // 状态
                status: 'pending',    // 'pending' | 'processed' | 'error'
                backgroundColor: null, // 检测到的背景色
                fillColor: null,      // 填充颜色
                error: null
            };

            this._items.push(item);
            this._emit('itemAdd', item);

            // 如果是第一张图片，自动选中
            if (this._items.length === 1) {
                this.selectItem(0);
            }

            return item;

        } catch (error) {
            throw new Error(`添加图片失败: ${error.message}`);
        }
    },

    /**
     * 批量添加图片
     * @param {FileList|File[]} files - 文件列表
     * @param {Function} progressCallback - 进度回调
     */
    async addImages(files, progressCallback) {
        const results = [];
        const total = files.length;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            // 检查文件类型
            if (!this._isValidImageType(file.type)) {
                console.warn(`跳过不支持的文件类型: ${file.name}`);
                continue;
            }

            // 检查文件大小
            if (file.size > CONFIG.MAX_FILE_SIZE) {
                console.warn(`跳过超大文件: ${file.name}`);
                continue;
            }

            try {
                const item = await this.addImage(file);
                results.push(item);
            } catch (error) {
                console.warn(`添加图片失败 ${file.name}: ${error.message}`);
            }

            if (progressCallback) {
                progressCallback(Math.round((i + 1) / total * 100));
            }
        }

        return results;
    },

    /**
     * 移除图片
     */
    removeItem(itemId) {
        const index = this._items.findIndex(item => item.id === itemId);
        if (index !== -1) {
            const removed = this._items.splice(index, 1)[0];
            this._emit('itemRemove', removed);

            // 调整选中索引
            if (this._currentIndex >= this._items.length) {
                this._currentIndex = this._items.length - 1;
            }

            // 如果还有图片，选中对应索引的图片
            if (this._items.length > 0 && this._currentIndex >= 0) {
                this._emit('itemSelect', this._items[this._currentIndex]);
            }
        }
    },

    /**
     * 选择图片
     */
    selectItem(index) {
        if (index >= 0 && index < this._items.length) {
            this._currentIndex = index;
            this._emit('itemSelect', this._items[index]);
        }
    },

    /**
     * 通过ID选择图片
     */
    selectItemById(itemId) {
        const index = this._items.findIndex(item => item.id === itemId);
        if (index !== -1) {
            this.selectItem(index);
        }
    },

    /**
     * 获取当前选中项
     */
    getCurrentItem() {
        return this._items[this._currentIndex] || null;
    },

    /**
     * 获取当前选中索引
     */
    getCurrentIndex() {
        return this._currentIndex;
    },

    /**
     * 处理单张图片
     * @param {string} itemId - 图片ID
     */
    async processItem(itemId) {
        const item = this._items.find(i => i.id === itemId);
        if (!item) throw new Error('图片不存在');

        try {
            // 初始化抠图器
            BackgroundRemover.init(item.originalCanvas);

            // 检测或使用指定背景色
            let bgColor = item.backgroundColor;
            if (!bgColor && this._globalConfig.autoDetect) {
                bgColor = BackgroundRemover.detectBackgroundColor(item.originalCanvas, 'corners');
                item.backgroundColor = bgColor;
            }

            if (bgColor) {
                BackgroundRemover.setTargetColor(bgColor);
                BackgroundRemover.setConfig({
                    tolerance: this._globalConfig.tolerance,
                    edgeFeather: this._globalConfig.edgeFeather
                });

                // 执行抠图
                item.processedCanvas = BackgroundRemover.removeBackground();
                item.maskCanvas = BackgroundRemover.getMask();
            } else {
                // 没有背景色，直接使用原图
                item.processedCanvas = CanvasUtils.cloneCanvas(item.originalCanvas);
            }

            item.status = 'processed';

            // 应用背景填充
            if (this._globalConfig.backgroundColor) {
                item.processedCanvas = ColorFiller.fillBackground(
                    item.processedCanvas,
                    this._globalConfig.backgroundColor
                );
                item.fillColor = this._globalConfig.backgroundColor;
            }

            this._emit('itemProcess', item);
            return item;

        } catch (error) {
            item.status = 'error';
            item.error = error.message;
            throw error;
        }
    },

    /**
     * 更新单个图片的处理结果
     */
    updateItemMask(itemId, maskCanvas) {
        const item = this._items.find(i => i.id === itemId);
        if (!item) return;

        // 更新蒙版
        item.maskCanvas = CanvasUtils.cloneCanvas(maskCanvas);

        // 重新应用蒙版
        item.processedCanvas = BackgroundRemover.applyMaskToSource(
            item.originalCanvas,
            item.maskCanvas
        );

        // 应用背景填充
        if (this._globalConfig.backgroundColor) {
            item.processedCanvas = ColorFiller.fillBackground(
                item.processedCanvas,
                this._globalConfig.backgroundColor
            );
        }

        item.status = 'processed';
        this._emit('itemUpdate', item);
    },

    /**
     * 应用填充颜色到当前图片
     */
    applyFillColor(itemId, color) {
        const item = this._items.find(i => i.id === itemId);
        if (!item || !item.processedCanvas) return;

        // 从抠图结果重新应用填充
        const processedCanvas = BackgroundRemover.applyMaskToSource(
            item.originalCanvas,
            item.maskCanvas
        );

        if (color) {
            item.processedCanvas = ColorFiller.fillBackground(processedCanvas, color);
            item.fillColor = color;
        } else {
            item.processedCanvas = processedCanvas;
            item.fillColor = null;
        }

        this._globalConfig.backgroundColor = color;
        this._emit('itemUpdate', item);
    },

    /**
     * 批量处理所有图片
     * @param {Function} progressCallback - 进度回调 { current, total, item }
     */
    async processAll(progressCallback) {
        const total = this._items.length;
        const results = { success: 0, failed: 0, items: [] };

        for (let i = 0; i < this._items.length; i++) {
            const item = this._items[i];

            try {
                await this.processItem(item.id);
                results.success++;
                results.items.push({ item, success: true });
            } catch (error) {
                results.failed++;
                results.items.push({ item, success: false, error: error.message });
            }

            if (progressCallback) {
                progressCallback({
                    current: i + 1,
                    total: total,
                    percent: Math.round((i + 1) / total * 100),
                    item: item
                });
            }
        }

        this._emit('allProcessed', results);
        return results;
    },

    /**
     * 导出单张图片
     */
    async exportItem(itemId) {
        const item = this._items.find(i => i.id === itemId);
        if (!item || !item.processedCanvas) {
            throw new Error('图片未处理或不存在');
        }

        const format = this._globalConfig.outputFormat;
        const blob = await CanvasUtils.canvasToBlob(item.processedCanvas, format);
        const ext = format === 'jpg' ? 'jpg' : 'png';
        const filename = item.name.replace(/\.[^.]+$/, `_cutout.${ext}`);

        this._downloadBlob(blob, filename);
    },

    /**
     * 批量导出（ZIP打包）
     */
    async exportAll(progressCallback) {
        const processedItems = this._items.filter(i => i.status === 'processed');

        if (processedItems.length === 0) {
            throw new Error('没有已处理的图片可导出');
        }

        // 检查JSZip是否可用
        if (typeof JSZip === 'undefined') {
            // 如果只有一张图片，直接下载
            if (processedItems.length === 1) {
                return this.exportItem(processedItems[0].id);
            }
            throw new Error('批量导出需要JSZip库支持');
        }

        const zip = new JSZip();
        const format = this._globalConfig.outputFormat;
        const total = processedItems.length;

        for (let i = 0; i < processedItems.length; i++) {
            const item = processedItems[i];

            const blob = await CanvasUtils.canvasToBlob(item.processedCanvas, format);
            const ext = format === 'jpg' ? 'jpg' : 'png';
            const filename = item.name.replace(/\.[^.]+$/, `_cutout.${ext}`);

            zip.file(filename, blob);

            if (progressCallback) {
                progressCallback({
                    current: i + 1,
                    total: total,
                    percent: Math.round((i + 1) / total * 100)
                });
            }
        }

        // 生成ZIP
        const zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE'
        });

        const timestamp = new Date().toISOString().slice(0, 10);
        this._downloadBlob(zipBlob, `cutouts_${timestamp}.zip`);
    },

    /**
     * 设置全局配置
     */
    setGlobalConfig(config) {
        Object.assign(this._globalConfig, config);
    },

    /**
     * 获取全局配置
     */
    getGlobalConfig() {
        return { ...this._globalConfig };
    },

    /**
     * 获取所有项
     */
    getItems() {
        return this._items;
    },

    /**
     * 获取统计信息
     */
    getStats() {
        return {
            total: this._items.length,
            pending: this._items.filter(i => i.status === 'pending').length,
            processed: this._items.filter(i => i.status === 'processed').length,
            error: this._items.filter(i => i.status === 'error').length
        };
    },

    /**
     * 清除所有
     */
    clear() {
        this._items = [];
        this._currentIndex = -1;
    },

    /**
     * 注册回调
     */
    on(event, callback) {
        if (this._callbacks[event]) {
            this._callbacks[event].push(callback);
        }
    },

    /**
     * 触发事件
     */
    _emit(event, data) {
        if (this._callbacks[event]) {
            this._callbacks[event].forEach(cb => cb(data));
        }
    },

    // ===== 辅助方法 =====

    _readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(file);
        });
    },

    _loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = src;
        });
    },

    _isValidImageType(type) {
        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];
        return validTypes.includes(type);
    },

    _downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};
