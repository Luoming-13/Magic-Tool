/**
 * Magic Pixel - 画笔工具模块
 *
 * 手动擦除和恢复画笔工具
 */

const BrushTool = {
    // 配置
    _config: {
        size: 30,              // 画笔大小
        hardness: 80,          // 硬度 (0-100)
        opacity: 100,          // 不透明度 (0-100)
    },

    // 模式: 'erase' | 'restore'
    _mode: 'erase',

    // 外部取色状态（由 backgroundRemoverApp 设置）
    _isExternalColorPicking: false,

    // 状态
    _canvas: null,
    _ctx: null,
    _maskCanvas: null,
    _maskCtx: null,
    _originalCanvas: null,    // 原始图像备份

    // 绘制状态
    _isDrawing: false,
    _lastX: 0,
    _lastY: 0,

    // 历史记录
    _history: [],
    _historyIndex: -1,
    _maxHistory: 20,

    // 回调
    _callbacks: {
        maskChange: [],
        brushStart: [],
        brushEnd: []
    },

    // 取色模式
    _isPickingColor: false,
    _colorPickCallback: null,

    /**
     * 初始化
     * @param {HTMLCanvasElement} canvas - 显示Canvas
     * @param {HTMLCanvasElement} maskCanvas - 蒙版Canvas
     * @param {HTMLCanvasElement} originalCanvas - 原始图像Canvas
     */
    init(canvas, maskCanvas, originalCanvas) {
        this._canvas = canvas;
        this._ctx = canvas.getContext('2d');
        this._maskCanvas = maskCanvas;
        this._maskCtx = maskCanvas.getContext('2d');
        this._originalCanvas = originalCanvas;

        this._bindEvents();
    },

    /**
     * 绑定事件
     */
    _bindEvents() {
        // 鼠标事件
        DOM.on(this._canvas, 'mousedown', (e) => this._handleMouseDown(e));
        DOM.on(this._canvas, 'mousemove', (e) => this._handleMouseMove(e));
        DOM.on(this._canvas, 'mouseup', () => this._stopDrawing());
        DOM.on(this._canvas, 'mouseleave', () => this._stopDrawing());

        // 触摸事件
        DOM.on(this._canvas, 'touchstart', (e) => {
            e.preventDefault();
            this._handleMouseDown(e.touches[0]);
        });
        DOM.on(this._canvas, 'touchmove', (e) => {
            e.preventDefault();
            this._handleMouseMove(e.touches[0]);
        });
        DOM.on(this._canvas, 'touchend', () => this._stopDrawing());
    },

    /**
     * 处理鼠标按下
     */
    _handleMouseDown(e) {
        // 如果外部正在进行取色操作，不处理绘制
        if (this._isExternalColorPicking) return;

        const rect = this._canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 取色模式
        if (this._isPickingColor) {
            this._pickColorAt(x, y);
            return;
        }

        this._isDrawing = true;
        this._lastX = x;
        this._lastY = y;

        // 绘制单点
        this._drawPoint(x, y);

        this._emit('brushStart');
    },

    /**
     * 处理鼠标移动
     */
    _handleMouseMove(e) {
        const rect = this._canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (!this._isDrawing) return;

        // 绘制线段
        this._drawLine(this._lastX, this._lastY, x, y);

        this._lastX = x;
        this._lastY = y;
    },

    /**
     * 停止绘制
     */
    _stopDrawing() {
        if (this._isDrawing) {
            this._isDrawing = false;
            this._saveHistory();
            this._emitMaskChange();
            this._emit('brushEnd');
        }
    },

    /**
     * 绘制单点
     */
    _drawPoint(x, y) {
        const { size, opacity } = this._config;

        this._maskCtx.save();

        if (this._mode === 'erase') {
            // 擦除模式：设置蒙版为透明
            this._maskCtx.globalCompositeOperation = 'destination-out';
        } else {
            // 恢复模式：恢复蒙版为不透明
            this._maskCtx.globalCompositeOperation = 'destination-over';
        }

        // 创建渐变画笔（模拟硬度）
        const hardness = this._config.hardness / 100;
        const gradient = this._maskCtx.createRadialGradient(x, y, 0, x, y, size / 2);

        if (hardness >= 0.99) {
            gradient.addColorStop(0, `rgba(0, 0, 0, ${opacity / 100})`);
            gradient.addColorStop(1, `rgba(0, 0, 0, ${opacity / 100})`);
        } else {
            gradient.addColorStop(0, `rgba(0, 0, 0, ${opacity / 100})`);
            gradient.addColorStop(hardness, `rgba(0, 0, 0, ${opacity / 100})`);
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        }

        this._maskCtx.fillStyle = gradient;
        this._maskCtx.beginPath();
        this._maskCtx.arc(x, y, size / 2, 0, Math.PI * 2);
        this._maskCtx.fill();

        this._maskCtx.restore();

        // 更新显示
        this._updateDisplay();
    },

    /**
     * 绘制线段（插值）
     */
    _drawLine(x1, y1, x2, y2) {
        const distance = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const step = Math.max(1, this._config.size / 8);
        const steps = Math.ceil(distance / step);

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = x1 + (x2 - x1) * t;
            const y = y1 + (y2 - y1) * t;
            this._drawPoint(x, y);
        }
    },

    /**
     * 更新显示Canvas
     */
    _updateDisplay() {
        if (!this._originalCanvas) return;

        const width = this._canvas.width;
        const height = this._canvas.height;

        // 获取蒙版数据
        const maskData = this._maskCtx.getImageData(0, 0, width, height);

        // 获取原始图像数据
        const originalCtx = this._originalCanvas.getContext('2d');
        const originalData = originalCtx.getImageData(0, 0, width, height);

        // 创建结果数据
        const resultData = new ImageData(width, height);

        // 应用蒙版
        for (let i = 0; i < maskData.data.length; i += 4) {
            const maskAlpha = maskData.data[i]; // 蒙版灰度值
            const originalAlpha = originalData.data[i + 3];

            resultData.data[i] = originalData.data[i];
            resultData.data[i + 1] = originalData.data[i + 1];
            resultData.data[i + 2] = originalData.data[i + 2];
            resultData.data[i + 3] = Math.round(maskAlpha * originalAlpha / 255);
        }

        // 写入显示Canvas
        this._ctx.putImageData(resultData, 0, 0);
    },

    /**
     * 设置模式
     * @param {string} mode - 'erase' | 'restore'
     */
    setMode(mode) {
        this._mode = mode;
    },

    /**
     * 获取当前模式
     */
    getMode() {
        return this._mode;
    },

    /**
     * 设置配置
     */
    setConfig(config) {
        Object.assign(this._config, config);
    },

    /**
     * 获取配置
     */
    getConfig() {
        return { ...this._config };
    },

    /**
     * 设置蒙版
     */
    setMask(maskCanvas) {
        this._maskCtx.drawImage(maskCanvas, 0, 0);
        this._updateDisplay();
    },

    /**
     * 设置原始图像
     */
    setOriginal(originalCanvas) {
        this._originalCanvas = originalCanvas;
        // 重置画布大小
        this._canvas.width = originalCanvas.width;
        this._canvas.height = originalCanvas.height;
        this._maskCanvas.width = originalCanvas.width;
        this._maskCanvas.height = originalCanvas.height;
    },

    /**
     * 保存历史
     */
    _saveHistory() {
        // 裁剪历史
        if (this._historyIndex < this._history.length - 1) {
            this._history = this._history.slice(0, this._historyIndex + 1);
        }

        // 保存当前蒙版
        const snapshot = CanvasUtils.cloneCanvas(this._maskCanvas);
        this._history.push(snapshot);

        // 限制历史数量
        if (this._history.length > this._maxHistory) {
            this._history.shift();
        } else {
            this._historyIndex++;
        }
    },

    /**
     * 撤销
     */
    undo() {
        if (this._historyIndex > 0) {
            this._historyIndex--;
            this._restoreFromHistory();
        }
    },

    /**
     * 重做
     */
    redo() {
        if (this._historyIndex < this._history.length - 1) {
            this._historyIndex++;
            this._restoreFromHistory();
        }
    },

    /**
     * 从历史恢复
     */
    _restoreFromHistory() {
        const snapshot = this._history[this._historyIndex];
        this._maskCtx.drawImage(snapshot, 0, 0);
        this._updateDisplay();
        this._emitMaskChange();
    },

    /**
     * 是否可以撤销
     */
    canUndo() {
        return this._historyIndex > 0;
    },

    /**
     * 是否可以重做
     */
    canRedo() {
        return this._historyIndex < this._history.length - 1;
    },

    /**
     * 开始取色模式
     */
    startColorPick(callback) {
        this._isPickingColor = true;
        this._colorPickCallback = callback;
        this._canvas.style.cursor = 'crosshair';
    },

    /**
     * 结束取色模式
     */
    endColorPick() {
        this._isPickingColor = false;
        this._colorPickCallback = null;
        this._canvas.style.cursor = 'default';
    },

    /**
     * 设置外部取色状态
     * @param {boolean} picking - 是否正在取色
     */
    setColorPicking(picking) {
        this._isExternalColorPicking = picking;
    },

    /**
     * 取色
     */
    _pickColorAt(x, y) {
        const pixel = this._ctx.getImageData(x, y, 1, 1).data;
        const color = {
            r: pixel[0],
            g: pixel[1],
            b: pixel[2]
        };

        if (this._colorPickCallback) {
            this._colorPickCallback(color);
        }

        this.endColorPick();
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

    /**
     * 触发蒙版变化
     */
    _emitMaskChange() {
        this._callbacks.maskChange.forEach(cb => cb(this._maskCanvas));
    },

    /**
     * 获取当前蒙版
     */
    getMask() {
        return this._maskCanvas;
    },

    /**
     * 清除
     */
    clear() {
        this._history = [];
        this._historyIndex = -1;
        this._isDrawing = false;
    }
};
