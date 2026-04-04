/**
 * Magic Pixel - 对齐与锚点计算模块
 *
 * 计算最大尺寸、锚点偏移，生成对齐后的数据
 * 改造：支持 Block 数据结构
 */

const FrameAligner = {
    // 锚点类型定义
    PIVOT_TYPES: {
        BOTTOM_CENTER: 'bottom-center',   // 底部居中（RPG 行走图）
        CENTER_CENTER: 'center-center',   // 正中心（飞行道具、爆炸特效）
        TOP_LEFT: 'top-left'              // 左上角（UI 元素）
    },

    // 配置
    _config: {
        pivotType: 'bottom-center',       // 当前选中的锚点类型
        extend: {
            horizontal: 0,                // 左右扩展距离
            vertical: 0                   // 上下扩展距离
        }
    },

    // 计算结果
    _result: null,

    // 回调函数
    _callbacks: {
        aligned: []
    },

    /**
     * 计算对齐
     * @param {Array} items - 数据数组（Block 或 Frame，已包含 region）
     * @returns {Object} 对齐结果 { maxSize, pivotType, blocks }
     */
    calculate(items) {
        if (!items || items.length === 0) {
            return null;
        }

        // 过滤出有有效区域的数据
        const validItems = items.filter(item => item.region && item.region.width > 0 && item.region.height > 0);

        if (validItems.length === 0) {
            return null;
        }

        // 1. 找出最大宽高
        const maxSize = this._findMaxSize(validItems);

        // 2. 根据锚点类型计算每项的偏移
        const alignedItems = validItems.map(item => {
            const pivot = this._calculatePivot(item.region, maxSize);

            // 更新 item 的 pivot
            item.pivot = pivot;

            return item;
        });

        // 3. 存储结果
        this._result = {
            maxSize: maxSize,
            pivotType: this._config.pivotType,
            blocks: alignedItems  // 改名以兼容新结构
        };

        this._emit('aligned', [this._result]);
        return this._result;
    },

    /**
     * 找出最大尺寸
     * @param {Array} items - 数据数组
     * @returns {Object} 最大尺寸 { width, height }
     */
    _findMaxSize(items) {
        let maxWidth = 0;
        let maxHeight = 0;

        for (const item of items) {
            if (item.region) {
                maxWidth = Math.max(maxWidth, item.region.width);
                maxHeight = Math.max(maxHeight, item.region.height);
            }
        }

        // 应用扩展距离
        const { horizontal, vertical } = this._config.extend;
        maxWidth = Math.max(1, maxWidth + horizontal * 2);  // 左右对称扩展
        maxHeight = Math.max(1, maxHeight + vertical * 2);   // 上下扩展

        return { width: maxWidth, height: maxHeight };
    },

    /**
     * 计算锚点偏移
     * @param {Object} region - 区域信息 { x, y, width, height }
     * @param {Object} maxSize - 最大尺寸 { width, height }
     * @returns {Object} 偏移 { offsetX, offsetY }
     */
    _calculatePivot(region, maxSize) {
        if (!region || !maxSize) {
            return { offsetX: 0, offsetY: 0 };
        }

        const { width, height } = region;
        const { width: maxW, height: maxH } = maxSize;
        const { horizontal, vertical } = this._config.extend;

        // 计算基础尺寸（不包含扩展）
        const baseMaxW = maxW - horizontal * 2;
        const baseMaxH = maxH - vertical * 2;

        let offsetX = 0;
        let offsetY = 0;

        switch (this._config.pivotType) {
            case 'bottom-center':
                // 底部居中：X 居中，Y 底部对齐
                // 扩展距离：向上扩展，所以 offsetY 需要加上 vertical
                offsetX = Math.floor((baseMaxW - width) / 2) + horizontal;
                offsetY = (baseMaxH - height) + vertical;  // 底部对齐 + 向上扩展
                break;

            case 'center-center':
                // 正中心：X 和 Y 都居中
                // 扩展距离：上下对称扩展
                offsetX = Math.floor((baseMaxW - width) / 2) + horizontal;
                offsetY = Math.floor((baseMaxH - height) / 2) + vertical;
                break;

            case 'top-left':
                // 左上角：不需要偏移
                // 扩展距离：向下扩展，所以 offsetY 保持为 vertical
                offsetX = horizontal;
                offsetY = vertical;
                break;

            default:
                // 默认底部居中
                offsetX = Math.floor((baseMaxW - width) / 2) + horizontal;
                offsetY = (baseMaxH - height) + vertical;
        }

        return { offsetX, offsetY };
    },

    /**
     * 渲染对齐预览
     * @param {Object} item - 数据对象（Block 或 Frame）
     * @param {Object} maxSize - 最大尺寸
     * @returns {HTMLCanvasElement} 渲染后的 Canvas
     */
    renderPreview(item, maxSize) {
        if (!item || !item.region || !maxSize) {
            return null;
        }

        const { region } = item;
        // 兼容 Block (sourceImage) 和 Frame (image)
        const image = item.sourceImage || item.image;
        const { offsetX, offsetY } = this._calculatePivot(region, maxSize);

        // 创建 Canvas
        const canvas = document.createElement('canvas');
        canvas.width = maxSize.width;
        canvas.height = maxSize.height;
        const ctx = canvas.getContext('2d');

        // 清除透明
        ctx.clearRect(0, 0, maxSize.width, maxSize.height);

        // 使用精确绘制（如果有 pixelCoords）
        if (typeof AutoSlicer !== 'undefined' && AutoSlicer.renderRegionToCanvas) {
            AutoSlicer.renderRegionToCanvas(image, region, item.pixelCoords, ctx, offsetX, offsetY);
        } else {
            // 回退到矩形绘制
            ctx.drawImage(
                image,
                region.x, region.y, region.width, region.height,
                offsetX, offsetY, region.width, region.height
            );
        }

        return canvas;
    },

    /**
     * 渲染对齐后的帧（带网格背景）
     * @param {Object} frame - 帧数据对象
     * @param {Object} maxSize - 最大尺寸
     * @param {boolean} showGrid - 是否显示网格背景
     * @returns {HTMLCanvasElement} 渲染后的 Canvas
     */
    renderPreviewWithGrid(frame, maxSize, showGrid = true) {
        const canvas = this.renderPreview(frame, maxSize);

        if (!canvas || !showGrid) {
            return canvas;
        }

        const ctx = canvas.getContext('2d');
        const { width, height } = maxSize;

        // 绘制棋盘格背景（透明度指示）
        const gridSize = 8;
        ctx.globalCompositeOperation = 'destination-over';

        for (let y = 0; y < height; y += gridSize) {
            for (let x = 0; x < width; x += gridSize) {
                const isLight = ((x / gridSize) + (y / gridSize)) % 2 === 0;
                ctx.fillStyle = isLight ? '#FFFFFF' : '#E0E0E0';
                ctx.fillRect(x, y, gridSize, gridSize);
            }
        }

        ctx.globalCompositeOperation = 'source-over';
        return canvas;
    },

    /**
     * 获取计算结果
     * @returns {Object|null} 对齐结果
     */
    getResult() {
        return this._result;
    },

    /**
     * 设置锚点类型
     * @param {string} type - 锚点类型 ('bottom-center' | 'center-center' | 'top-left')
     */
    setPivotType(type) {
        if (Object.values(this.PIVOT_TYPES).includes(type)) {
            this._config.pivotType = type;

            // 如果已有结果，重新计算
            if (this._result && this._result.blocks) {
                this.calculate(this._result.blocks);
            }
        }
    },

    /**
     * 获取当前锚点类型
     * @returns {string} 锚点类型
     */
    getPivotType() {
        return this._config.pivotType;
    },

    /**
     * 设置扩展距离
     * @param {Object} extend - 扩展距离 { horizontal, vertical }
     */
    setExtend(extend) {
        this._config.extend = {
            horizontal: Math.max(0, parseInt(extend.horizontal) || 0),
            vertical: Math.max(0, parseInt(extend.vertical) || 0)
        };

        // 如果已有结果，重新计算
        if (this._result && this._result.blocks) {
            this.calculate(this._result.blocks);
        }
    },

    /**
     * 获取扩展距离
     * @returns {Object} 扩展距离 { horizontal, vertical }
     */
    getExtend() {
        return { ...this._config.extend };
    },

    /**
     * 清除结果
     */
    clear() {
        this._result = null;
    },

    /**
     * 注册事件回调
     * @param {string} event - 事件名称
     * @param {Function} callback - 回调函数
     */
    on(event, callback) {
        if (this._callbacks[event]) {
            this._callbacks[event].push(callback);
        }
    },

    /**
     * 触发事件
     * @param {string} event - 事件名称
     * @param {Array} args - 参数数组
     */
    _emit(event, args) {
        if (this._callbacks[event]) {
            this._callbacks[event].forEach(callback => {
                try {
                    callback.apply(null, args);
                } catch (error) {
                    console.error(`FrameAligner callback error [${event}]:`, error);
                }
            });
        }
    }
};
