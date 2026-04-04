/**
 * Magic Pixel - 手动框选交互模块
 *
 * 在 Canvas 上实现交互式框选功能
 * 改造：框选用于限定检测范围，支持多次框选累积
 */

const ManualSelector = {
    // Canvas 元素
    _canvas: null,
    _ctx: null,

    // 当前源图
    _source: null,

    // 已提取的块列表（用于预览显示）
    _existingBlocks: [],

    // 当前框选区域
    _currentRegion: null,

    // 交互状态
    _interaction: {
        mode: null,           // 'draw' | 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | 'pan'
        startX: 0,
        startY: 0,
        originalRegion: null
    },

    // 平移状态
    _panState: {
        isDragging: false,
        startX: 0,
        startY: 0,
        offsetX: 0,
        offsetY: 0
    },

    // 缩放级别
    _zoom: 1,

    // 包装器元素
    _wrapper: null,
    _container: null,

    // 配置
    _config: {
        handleSize: 10,       // 调整手柄大小
        minSize: 4,           // 最小框选尺寸
        borderColor: '#B8844A',
        existingBlockColor: '#4CAF50',  // 已提取块的颜色
        handleColor: '#FFFFFF',
        maskColor: 'rgba(44, 24, 16, 0.5)',
        existingBlockMaskColor: 'rgba(76, 175, 80, 0.15)',
        dashPattern: [6, 4]
    },

    // 回调函数
    _callbacks: {
        selectionChange: [],
        selectionComplete: [],
        regionSelected: []    // 新增：框选完成事件
    },

    /**
     * 初始化
     * @param {string|HTMLCanvasElement} canvas - Canvas 元素或选择器
     */
    init(canvas) {
        this._canvas = typeof canvas === 'string' ? DOM.$(canvas) : canvas;

        if (!this._canvas) {
            console.error('ManualSelector: Canvas 元素未找到');
            return;
        }

        this._ctx = this._canvas.getContext('2d');
        this._wrapper = this._canvas.parentElement;  // preview-wrapper
        this._container = this._wrapper?.parentElement;  // preview-container
        this._bindEvents();
        this._bindPanEvents();

        console.log('ManualSelector - 初始化完成');
    },

    /**
     * 绑定事件
     */
    _bindEvents() {
        // 鼠标事件
        DOM.on(this._canvas, 'mousedown', (e) => this._onPointerDown(e));
        DOM.on(this._canvas, 'mousemove', (e) => this._onPointerMove(e));
        DOM.on(this._canvas, 'mouseup', (e) => this._onPointerUp(e));
        DOM.on(this._canvas, 'mouseleave', (e) => this._onPointerUp(e));

        // 触摸事件
        DOM.on(this._canvas, 'touchstart', (e) => this._onTouchStart(e));
        DOM.on(this._canvas, 'touchmove', (e) => this._onTouchMove(e));
        DOM.on(this._canvas, 'touchend', (e) => this._onTouchEnd(e));

        // 光标样式
        DOM.on(this._canvas, 'mousemove', (e) => this._updateCursor(e));
    },

    /**
     * 绑定平移事件（在容器上监听，按住空格键或中键拖拽）
     */
    _bindPanEvents() {
        if (!this._container) return;

        // 空格键状态
        let spacePressed = false;

        DOM.on(document, 'keydown', (e) => {
            if (e.code === 'Space' && !spacePressed) {
                spacePressed = true;
                this._canvas.style.cursor = 'grab';
            }
        });

        DOM.on(document, 'keyup', (e) => {
            if (e.code === 'Space') {
                spacePressed = false;
                this._canvas.style.cursor = 'crosshair';
            }
        });

        // 鼠标按下 - 开始平移
        DOM.on(this._canvas, 'mousedown', (e) => {
            // 空格键或中键触发平移
            if (spacePressed || e.button === 1) {
                e.preventDefault();
                this._panState.isDragging = true;
                this._panState.startX = e.clientX - this._panState.offsetX;
                this._panState.startY = e.clientY - this._panState.offsetY;
                this._canvas.style.cursor = 'grabbing';
                DOM.addClass(this._wrapper, 'dragging');
            }
        });

        // 鼠标移动 - 平移中
        DOM.on(document, 'mousemove', (e) => {
            if (!this._panState.isDragging) return;
            this._panState.offsetX = e.clientX - this._panState.startX;
            this._panState.offsetY = e.clientY - this._panState.startY;
            this._updateTransform();
        });

        // 鼠标释放 - 结束平移
        DOM.on(document, 'mouseup', () => {
            if (this._panState.isDragging) {
                this._panState.isDragging = false;
                this._canvas.style.cursor = spacePressed ? 'grab' : 'crosshair';
                DOM.removeClass(this._wrapper, 'dragging');
            }
        });
    },

    /**
     * 更新变换（缩放+平移）
     */
    _updateTransform() {
        if (!this._wrapper) return;
        const { offsetX, offsetY } = this._panState;
        this._wrapper.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${this._zoom})`;
    },

    /**
     * 重置平移状态
     */
    resetPan() {
        this._panState = {
            isDragging: false,
            startX: 0,
            startY: 0,
            offsetX: 0,
            offsetY: 0
        };
        this._updateTransform();
    },

    /**
     * 设置源图
     * @param {Object} source - 源图数据对象 { id, name, image, width, height }
     */
    setSource(source) {
        this._source = source;
        this._existingBlocks = [];
        this._currentRegion = null;

        // 重置平移状态
        this.resetPan();

        if (source) {
            // 设置 Canvas 内部尺寸为源图尺寸
            this._canvas.width = source.width;
            this._canvas.height = source.height;
            // CSS 尺寸保持为源图尺寸，缩放通过 transform 实现
            this._canvas.style.width = `${source.width}px`;
            this._canvas.style.height = `${source.height}px`;
            // 应用缩放变换
            this._updateTransform();
        }

        this.render();
    },

    /**
     * 设置已有块列表（用于显示已提取区域的预览）
     * @param {Array} blocks - Block 数组
     */
    setBlocks(blocks) {
        this._existingBlocks = blocks || [];
        this.render();
    },

    /**
     * 获取源图
     * @returns {Object|null}
     */
    getSource() {
        return this._source;
    },

    /**
     * 设置缩放
     * @param {number} zoom - 缩放级别
     */
    setZoom(zoom) {
        this._zoom = Math.max(0.1, Math.min(3, zoom));

        // 通过 transform 实现缩放，而不是修改 CSS 尺寸
        this._updateTransform();
        this.render();
    },

    /**
     * 获取当前框选区域
     * @returns {Object|null} 区域信息
     */
    getRegion() {
        return this._currentRegion;
    },

    /**
     * 清除当前框选
     */
    clearCurrentSelection() {
        this._currentRegion = null;
        this.render();
    },

    /**
     * 清除所有状态
     */
    clear() {
        this._source = null;
        this._existingBlocks = [];
        this._currentRegion = null;
        this._interaction.mode = null;
        this._interaction.originalRegion = null;
    },

    /**
     * 渲染
     */
    render() {
        if (!this._canvas || !this._ctx) return;

        const ctx = this._ctx;
        const { width, height } = this._canvas;

        // 清除画布
        ctx.clearRect(0, 0, width, height);

        // 应用缩放
        ctx.save();
        ctx.scale(this._zoom, this._zoom);

        // 绘制源图
        if (this._source) {
            ctx.drawImage(this._source.image, 0, 0);
        }

        // 绘制已提取块的预览
        if (this._existingBlocks.length > 0) {
            this._drawExistingBlocks();
        }

        // 绘制当前框选区域
        if (this._currentRegion && this._currentRegion.width > 0 && this._currentRegion.height > 0) {
            this._drawCurrentSelection();
        }

        ctx.restore();
    },

    /**
     * 绘制已提取的块
     */
    _drawExistingBlocks() {
        const ctx = this._ctx;
        const { width: canvasW, height: canvasH } = this._canvas;

        for (const block of this._existingBlocks) {
            if (!block.region) continue;

            const { x, y, width: w, height: h } = block.region;

            // 绘制半透明填充
            ctx.fillStyle = this._config.existingBlockMaskColor;
            ctx.fillRect(x, y, w, h);

            // 绘制边框
            ctx.strokeStyle = this._config.existingBlockColor;
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.strokeRect(x, y, w, h);

            // 绘制块名称
            ctx.fillStyle = this._config.existingBlockColor;
            ctx.font = '12px Arial';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            const displayName = block.name.length > 10 ? block.name.substring(0, 10) + '...' : block.name;
            ctx.fillText(displayName, x + 4, y + 4);
        }
    },

    /**
     * 绘制当前框选区域
     */
    _drawCurrentSelection() {
        const ctx = this._ctx;
        const { width: canvasW, height: canvasH } = this._canvas;
        const { x, y, width: w, height: h } = this._currentRegion;

        // 绘制半透明遮罩（框外区域）
        ctx.fillStyle = this._config.maskColor;

        // 上
        ctx.fillRect(0, 0, canvasW, y);
        // 下
        ctx.fillRect(0, y + h, canvasW, canvasH - y - h);
        // 左
        ctx.fillRect(0, y, x, h);
        // 右
        ctx.fillRect(x + w, y, canvasW - x - w, h);

        // 绘制边框
        ctx.strokeStyle = this._config.borderColor;
        ctx.lineWidth = 2;
        ctx.setLineDash(this._config.dashPattern);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);

        // 绘制调整手柄
        this._drawHandles();

        // 绘制尺寸提示
        ctx.fillStyle = this._config.borderColor;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`${Math.round(w)} × ${Math.round(h)}`, x + w / 2, y - 4);
    },

    /**
     * 绘制调整手柄
     */
    _drawHandles() {
        const ctx = this._ctx;
        const handles = this._getHandlePositions();
        const size = this._config.handleSize;

        ctx.fillStyle = this._config.handleColor;
        ctx.strokeStyle = this._config.borderColor;
        ctx.lineWidth = 2;

        for (const handle of Object.values(handles)) {
            ctx.fillRect(handle.x - size / 2, handle.y - size / 2, size, size);
            ctx.strokeRect(handle.x - size / 2, handle.y - size / 2, size, size);
        }
    },

    /**
     * 获取手柄位置
     * @returns {Object} 手柄位置对象 { tl, tr, bl, br }
     */
    _getHandlePositions() {
        if (!this._currentRegion) return {};

        const { x, y, width: w, height: h } = this._currentRegion;

        return {
            'tl': { x: x, y: y },
            'tr': { x: x + w, y: y },
            'bl': { x: x, y: y + h },
            'br': { x: x + w, y: y + h }
        };
    },

    /**
     * 获取指定位置的手柄
     * @param {number} px - X 坐标
     * @param {number} py - Y 坐标
     * @returns {string|null} 手柄标识 ('tl' | 'tr' | 'bl' | 'br')
     */
    _getHandleAtPoint(px, py) {
        if (!this._currentRegion) return null;

        const handles = this._getHandlePositions();
        const hitRadius = this._config.handleSize + 4;

        for (const [key, handle] of Object.entries(handles)) {
            const dx = px - handle.x;
            const dy = py - handle.y;
            if (Math.sqrt(dx * dx + dy * dy) <= hitRadius) {
                return key;
            }
        }

        return null;
    },

    /**
     * 检查点是否在当前框选区域内
     * @param {number} px - X 坐标
     * @param {number} py - Y 坐标
     * @returns {boolean}
     */
    _isPointInRegion(px, py) {
        if (!this._currentRegion) return false;

        const { x, y, width: w, height: h } = this._currentRegion;
        return px >= x && px <= x + w && py >= y && py <= y + h;
    },

    /**
     * 获取 Canvas 上的坐标
     * @param {MouseEvent|Touch} e - 事件对象
     * @returns {Object} 坐标 { x, y }
     */
    _getCanvasCoords(e) {
        const rect = this._canvas.getBoundingClientRect();
        // 考虑缩放因素：屏幕坐标需要除以缩放比例
        const x = (e.clientX - rect.left) / this._zoom;
        const y = (e.clientY - rect.top) / this._zoom;

        return { x, y };
    },

    /**
     * 更新光标样式
     * @param {MouseEvent} e - 鼠标事件
     */
    _updateCursor(e) {
        const coords = this._getCanvasCoords(e);

        // 检查是否在手柄上
        const handle = this._getHandleAtPoint(coords.x, coords.y);
        if (handle) {
            const cursors = {
                'tl': 'nwse-resize',
                'tr': 'nesw-resize',
                'bl': 'nesw-resize',
                'br': 'nwse-resize'
            };
            this._canvas.style.cursor = cursors[handle];
            return;
        }

        // 检查是否在区域内
        if (this._isPointInRegion(coords.x, coords.y)) {
            this._canvas.style.cursor = 'move';
            return;
        }

        // 默认十字光标
        this._canvas.style.cursor = 'crosshair';
    },

    /**
     * 指针按下
     * @param {MouseEvent} e - 鼠标事件
     */
    _onPointerDown(e) {
        if (!this._source) return;

        e.preventDefault();
        const coords = this._getCanvasCoords(e);

        // 检查是否点击了手柄
        const handle = this._getHandleAtPoint(coords.x, coords.y);
        if (handle) {
            this._interaction.mode = `resize-${handle}`;
            this._startInteraction(coords.x, coords.y);
            return;
        }

        // 检查是否点击了区域内
        if (this._isPointInRegion(coords.x, coords.y)) {
            this._interaction.mode = 'move';
            this._startInteraction(coords.x, coords.y);
            return;
        }

        // 开始新绘制
        this._interaction.mode = 'draw';
        this._currentRegion = {
            x: coords.x,
            y: coords.y,
            width: 0,
            height: 0
        };
        this._startInteraction(coords.x, coords.y);
    },

    /**
     * 指针移动
     * @param {MouseEvent} e - 鼠标事件
     */
    _onPointerMove(e) {
        if (!this._interaction.mode) return;

        e.preventDefault();
        const coords = this._getCanvasCoords(e);

        const dx = coords.x - this._interaction.startX;
        const dy = coords.y - this._interaction.startY;

        switch (this._interaction.mode) {
            case 'draw':
                // 绘制模式：更新宽高
                if (dx >= 0) {
                    this._currentRegion.width = dx;
                } else {
                    this._currentRegion.x = coords.x;
                    this._currentRegion.width = -dx;
                }

                if (dy >= 0) {
                    this._currentRegion.height = dy;
                } else {
                    this._currentRegion.y = coords.y;
                    this._currentRegion.height = -dy;
                }
                break;

            case 'move':
                // 移动模式：更新位置
                this._currentRegion.x = Math.max(0, Math.min(
                    this._canvas.width - this._currentRegion.width,
                    this._interaction.originalRegion.x + dx
                ));
                this._currentRegion.y = Math.max(0, Math.min(
                    this._canvas.height - this._currentRegion.height,
                    this._interaction.originalRegion.y + dy
                ));
                break;

            case 'resize-tl':
                this._resizeTopLeft(dx, dy);
                break;
            case 'resize-tr':
                this._resizeTopRight(dx, dy);
                break;
            case 'resize-bl':
                this._resizeBottomLeft(dx, dy);
                break;
            case 'resize-br':
                this._resizeBottomRight(dx, dy);
                break;
        }

        this.render();
        this._emit('selectionChange', [this._currentRegion]);
    },

    /**
     * 指针释放
     * @param {MouseEvent} e - 鼠标事件
     */
    _onPointerUp(e) {
        if (!this._interaction.mode) return;

        // 检查区域是否有效
        if (this._currentRegion && this._currentRegion.width >= this._config.minSize && this._currentRegion.height >= this._config.minSize) {
            // 规范化区域
            this._normalizeRegion();

            // 触发区域选择事件（用于在该区域内检测块）
            this._emit('regionSelected', [{
                source: this._source,
                bounds: { ...this._currentRegion }
            }]);

            this._emit('selectionComplete', [this._currentRegion]);
        } else {
            // 区域太小，清除
            this._currentRegion = null;
            this._emit('selectionComplete', [null]);
        }

        // 重置交互状态
        this._interaction.mode = null;
        this._interaction.originalRegion = null;

        // 清除当前框选，准备下一次
        this._currentRegion = null;
        this.render();
    },

    /**
     * 开始交互
     * @param {number} x - 起点 X
     * @param {number} y - 起点 Y
     */
    _startInteraction(x, y) {
        this._interaction.startX = x;
        this._interaction.startY = y;

        if (this._currentRegion) {
            this._interaction.originalRegion = { ...this._currentRegion };
        }
    },

    /**
     * 规范化区域
     */
    _normalizeRegion() {
        if (!this._currentRegion) return;

        let { x, y, width, height } = this._currentRegion;

        // 确保宽高为正
        if (width < 0) {
            x += width;
            width = -width;
        }
        if (height < 0) {
            y += height;
            height = -height;
        }

        // 边界检查
        x = Math.max(0, Math.round(x));
        y = Math.max(0, Math.round(y));
        width = Math.min(Math.round(width), this._canvas.width - x);
        height = Math.min(Math.round(height), this._canvas.height - y);

        this._currentRegion = { x, y, width, height };
    },

    /**
     * 调整大小 - 左上角
     */
    _resizeTopLeft(dx, dy) {
        const orig = this._interaction.originalRegion;
        const newWidth = orig.width - dx;
        const newHeight = orig.height - dy;

        if (newWidth >= this._config.minSize) {
            this._currentRegion.x = orig.x + dx;
            this._currentRegion.width = newWidth;
        }
        if (newHeight >= this._config.minSize) {
            this._currentRegion.y = orig.y + dy;
            this._currentRegion.height = newHeight;
        }
    },

    /**
     * 调整大小 - 右上角
     */
    _resizeTopRight(dx, dy) {
        const orig = this._interaction.originalRegion;
        const newWidth = orig.width + dx;
        const newHeight = orig.height - dy;

        if (newWidth >= this._config.minSize) {
            this._currentRegion.width = newWidth;
        }
        if (newHeight >= this._config.minSize) {
            this._currentRegion.y = orig.y + dy;
            this._currentRegion.height = newHeight;
        }
    },

    /**
     * 调整大小 - 左下角
     */
    _resizeBottomLeft(dx, dy) {
        const orig = this._interaction.originalRegion;
        const newWidth = orig.width - dx;
        const newHeight = orig.height + dy;

        if (newWidth >= this._config.minSize) {
            this._currentRegion.x = orig.x + dx;
            this._currentRegion.width = newWidth;
        }
        if (newHeight >= this._config.minSize) {
            this._currentRegion.height = newHeight;
        }
    },

    /**
     * 调整大小 - 右下角
     */
    _resizeBottomRight(dx, dy) {
        const orig = this._interaction.originalRegion;

        this._currentRegion.width = Math.max(this._config.minSize, orig.width + dx);
        this._currentRegion.height = Math.max(this._config.minSize, orig.height + dy);
    },

    /**
     * 触摸开始
     * @param {TouchEvent} e - 触摸事件
     */
    _onTouchStart(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            this._onPointerDown({
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {}
            });
        }
    },

    /**
     * 触摸移动
     * @param {TouchEvent} e - 触摸事件
     */
    _onTouchMove(e) {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            this._onPointerMove({
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => {}
            });
        }
    },

    /**
     * 触摸结束
     * @param {TouchEvent} e - 触摸事件
     */
    _onTouchEnd(e) {
        this._onPointerUp(e);
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
                    console.error(`ManualSelector callback error [${event}]:`, error);
                }
            });
        }
    }
};
