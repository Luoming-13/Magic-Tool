/**
 * Magic Pixel - 图片加载模块
 */

const ImageLoader = {
    // 状态
    _image: null,
    _fileInfo: null,
    _callbacks: {
        loaded: [],
        error: [],
        analyzed: []
    },

    /**
     * 初始化
     */
    init(dropZoneId, fileInputId) {
        this._dropZone = DOM.$(`#${dropZoneId}`);
        this._fileInput = DOM.$(`#${fileInputId}`);

        this._bindEvents();
    },

    /**
     * 绑定事件
     */
    _bindEvents() {
        // 点击上传
        DOM.on(this._dropZone, 'click', () => {
            this._fileInput.click();
        });

        // 文件选择
        DOM.on(this._fileInput, 'change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleFile(file);
            }
        });

        // 拖拽事件
        DOM.on(this._dropZone, 'dragover', (e) => {
            e.preventDefault();
            DOM.addClass(this._dropZone, 'upload-zone--dragover');
        });

        DOM.on(this._dropZone, 'dragleave', (e) => {
            e.preventDefault();
            DOM.removeClass(this._dropZone, 'upload-zone--dragover');
        });

        DOM.on(this._dropZone, 'drop', (e) => {
            e.preventDefault();
            DOM.removeClass(this._dropZone, 'upload-zone--dragover');

            const file = e.dataTransfer.files[0];
            if (file) {
                this.handleFile(file);
            }
        });
    },

    /**
     * 处理文件
     */
    async handleFile(file) {
        // 验证文件类型
        if (!FileUtils.isValidImageType(file.type)) {
            this._emitError('不支持的文件格式，请上传 JPG, PNG, GIF, WebP 或 BMP 格式的图片');
            return;
        }

        // 验证文件大小
        if (!FileUtils.isValidFileSize(file.size)) {
            this._emitError(`文件大小超过限制 (最大 ${FileUtils.formatFileSize(CONFIG.MAX_FILE_SIZE)})`);
            return;
        }

        try {
            // 加载图片
            const dataUrl = await FileUtils.readFileAsDataUrl(file);
            const image = await FileUtils.loadImage(dataUrl);

            // 保存状态
            this._image = image;
            this._fileInfo = {
                name: file.name,
                size: file.size,
                type: file.type,
                width: image.width,
                height: image.height
            };

            // 更新 UI
            DOM.addClass(this._dropZone, 'upload-zone--loaded');

            // 触发回调
            this._emitLoaded(image, this._fileInfo);

            // 智能检测网格
            if (typeof GridDetector !== 'undefined') {
                const detection = GridDetector.detect(image);
                this._emitAnalyzed(detection);
            }

        } catch (error) {
            this._emitError('图片加载失败，请重试');
        }
    },

    /**
     * 获取图片
     */
    getImage() {
        return this._image;
    },

    /**
     * 获取文件信息
     */
    getFileInfo() {
        return this._fileInfo;
    },

    /**
     * 清除当前图片
     */
    clear() {
        this._image = null;
        this._fileInfo = null;
        this._fileInput.value = '';
        DOM.removeClass(this._dropZone, 'upload-zone--loaded');
    },

    /**
     * 注册事件回调
     */
    on(event, callback) {
        if (this._callbacks[event]) {
            this._callbacks[event].push(callback);
        }
    },

    /**
     * 触发分析完成
     */
    _emitAnalyzed(detection) {
        if (this._callbacks.analyzed) {
            this._callbacks.analyzed.forEach(cb => cb(detection));
        }
    },

    /**
     * 触发加载完成
     */
    _emitLoaded(image, info) {
        this._callbacks.loaded.forEach(cb => cb(image, info));
    },

    /**
     * 触发错误
     */
    _emitError(message) {
        this._callbacks.error.forEach(cb => cb(message));
    }
};
