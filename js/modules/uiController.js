/**
 * Magic Pixel - UI 控制模块
 */

const UIController = {
    // DOM 元素引用
    _elements: {},

    // 状态
    _state: 'idle', // idle, imageLoaded, processing, readyExport

    // 网格可见状态
    _gridVisible: true,

    // 缩放级别
    _zoomLevels: {
        preview: 100,
        pieces: 100
    },

    // 平移状态
    _panState: {
        isDragging: false,
        startX: 0,
        startY: 0,
        offsetX: 0,
        offsetY: 0
    },

    /**
     * 初始化
     */
    init() {
        this._cacheElements();
        this._bindEvents();
        this._bindZoomControls();
    },

    /**
     * 绑定缩放控制
     */
    _bindZoomControls() {
        const previewSlider = DOM.$('#previewZoomSlider');
        const previewValue = DOM.$('#previewZoomValue');
        const piecesSlider = DOM.$('#piecesZoomSlider');
        const piecesValue = DOM.$('#piecesZoomValue');

        if (previewSlider) {
            DOM.on(previewSlider, 'input', () => {
                const zoom = parseInt(previewSlider.value);
                this._zoomLevels.preview = zoom;
                previewValue.textContent = `${zoom}%`;
                this._updatePreviewTransform();
            });
        }

        if (piecesSlider) {
            DOM.on(piecesSlider, 'input', () => {
                const zoom = parseInt(piecesSlider.value);
                this._zoomLevels.pieces = zoom;
                piecesValue.textContent = `${zoom}%`;
                this._updatePieceGridZoom(zoom);
            });
        }
    },

    /**
     * 更新切割块网格缩放
     */
    _updatePieceGridZoom(zoom) {
        const items = this._elements.pieceGrid.querySelectorAll('.piece-grid__item');
        items.forEach(item => {
            item.style.minWidth = `${120 * zoom / 100}px`;
            item.style.minHeight = `${120 * zoom / 100}px`;
        });
    },

    /**
     * 缓存 DOM 元素
     */
    _cacheElements() {
        this._elements = {
            // 上传区域
            uploadZone: DOM.$('#uploadZone'),
            fileInput: DOM.$('#fileInput'),
            imageInfo: DOM.$('#imageInfo'),
            imageName: DOM.$('#imageName'),
            imageSize: DOM.$('#imageSize'),

            // 切割设置
            colsInput: DOM.$('#colsInput'),
            rowsInput: DOM.$('#rowsInput'),
            colsSlider: DOM.$('#colsSlider'),
            rowsSlider: DOM.$('#rowsSlider'),
            sliderMaxInput: DOM.$('#sliderMaxInput'),
            pieceSizeInfo: DOM.$('#pieceSizeInfo'),
            previewBtn: DOM.$('#previewBtn'),
            cutBtn: DOM.$('#cutBtn'),

            // 导出选项
            formatRadios: DOM.$$('input[name="format"]'),
            prefixInput: DOM.$('#prefixInput'),
            downloadSingleBtn: DOM.$('#downloadSingleBtn'),
            downloadZipBtn: DOM.$('#downloadZipBtn'),

            // 预览区域
            previewContainer: DOM.$('#previewContainer'),
            previewWrapper: DOM.$('#previewWrapper'),
            previewCanvas: DOM.$('#previewCanvas'),
            gridOverlay: DOM.$('#gridOverlay'),
            piecesSection: DOM.$('#piecesSection'),
            piecesCount: DOM.$('#piecesCount'),
            pieceGrid: DOM.$('#pieceGrid'),

            // 加载和进度
            loadingOverlay: DOM.$('#loadingOverlay'),
            loadingText: DOM.$('#loadingText'),
            progressBar: DOM.$('#progressBar'),
            progressFill: DOM.$('#progressFill'),
            progressText: DOM.$('#progressText'),

            // Toast
            toastContainer: DOM.$('#toastContainer')
        };
    },

    /**
     * 绑定事件
     */
    _bindEvents() {
        // 切割设置输入 - 实时更新预览
        DOM.on(this._elements.colsInput, 'input', () => this._onGridInputChange());
        DOM.on(this._elements.rowsInput, 'input', () => this._onGridInputChange());

        // 滑块变化
        DOM.on(this._elements.colsSlider, 'input', (e) => this._onSliderChange('cols', e.target.value));
        DOM.on(this._elements.rowsSlider, 'input', (e) => this._onSliderChange('rows', e.target.value));

        // 滑块上限变化
        DOM.on(this._elements.sliderMaxInput, 'input', (e) => this._onSliderMaxChange(e.target.value));

        // 预览按钮
        DOM.on(this._elements.previewBtn, 'click', () => this._onPreviewClick());

        // 切割按钮
        DOM.on(this._elements.cutBtn, 'click', () => this._onCutClick());

        // 格式选择
        this._elements.formatRadios.forEach(radio => {
            DOM.on(radio, 'change', (e) => {
                ImageExporter.setFormat(e.target.value);
            });
        });

        // 前缀输入
        DOM.on(this._elements.prefixInput, 'input', (e) => {
            ImageExporter.setNamingRule(e.target.value, CONFIG.DEFAULT_PADDING);
        });

        // 下载按钮
        DOM.on(this._elements.downloadSingleBtn, 'click', () => this._onDownloadSingleClick());
        DOM.on(this._elements.downloadZipBtn, 'click', () => this._onDownloadZipClick());

        // 平移事件
        this._bindPanEvents();

        // 滚轮缩放事件
        this._bindWheelZoom();
    },

    /**
     * 绑定平移事件
     */
    _bindPanEvents() {
        const wrapper = this._elements.previewWrapper;
        if (!wrapper) return;

        // 鼠标按下
        DOM.on(wrapper, 'mousedown', (e) => {
            if (this._state === 'idle') return;
            e.preventDefault();
            this._panState.isDragging = true;
            this._panState.startX = e.clientX - this._panState.offsetX;
            this._panState.startY = e.clientY - this._panState.offsetY;
            DOM.addClass(wrapper, 'dragging');
        });

        // 鼠标移动
        DOM.on(document, 'mousemove', (e) => {
            if (!this._panState.isDragging) return;
            this._panState.offsetX = e.clientX - this._panState.startX;
            this._panState.offsetY = e.clientY - this._panState.startY;
            this._updatePreviewTransform();
        });

        // 鼠标释放
        DOM.on(document, 'mouseup', () => {
            if (this._panState.isDragging) {
                this._panState.isDragging = false;
                DOM.removeClass(wrapper, 'dragging');
            }
        });

        // 触摸事件支持
        DOM.on(wrapper, 'touchstart', (e) => {
            if (this._state === 'idle') return;
            const touch = e.touches[0];
            this._panState.isDragging = true;
            this._panState.startX = touch.clientX - this._panState.offsetX;
            this._panState.startY = touch.clientY - this._panState.offsetY;
        });

        DOM.on(wrapper, 'touchmove', (e) => {
            if (!this._panState.isDragging) return;
            e.preventDefault();
            const touch = e.touches[0];
            this._panState.offsetX = touch.clientX - this._panState.startX;
            this._panState.offsetY = touch.clientY - this._panState.startY;
            this._updatePreviewTransform();
        });

        DOM.on(wrapper, 'touchend', () => {
            this._panState.isDragging = false;
        });
    },

    /**
     * 绑定滚轮缩放事件
     */
    _bindWheelZoom() {
        const container = this._elements.previewContainer;
        if (!container) return;

        DOM.on(container, 'wheel', (e) => {
            // 仅在图片加载后才能缩放
            if (this._state === 'idle') return;

            e.preventDefault();

            // 计算新的缩放值
            const delta = e.deltaY > 0 ? -10 : 10;
            const newZoom = Math.max(10, Math.min(200, this._zoomLevels.preview + delta));

            // 如果值没有变化，不执行后续操作
            if (newZoom === this._zoomLevels.preview) return;

            // 更新缩放值
            this._zoomLevels.preview = newZoom;

            // 同步更新滑块和显示值
            const slider = DOM.$('#previewZoomSlider');
            const valueDisplay = DOM.$('#previewZoomValue');
            if (slider) slider.value = newZoom;
            if (valueDisplay) valueDisplay.textContent = `${newZoom}%`;

            // 应用变换
            this._updatePreviewTransform();
        });
    },

    /**
     * 更新预览变换（缩放+平移）
     */
    _updatePreviewTransform() {
        const wrapper = this._elements.previewWrapper;
        if (!wrapper) return;

        const zoom = this._zoomLevels.preview;
        const { offsetX, offsetY } = this._panState;

        wrapper.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom / 100})`;
    },

    /**
     * 更新状态
     */
    setState(state) {
        this._state = state;
        this._updateButtonStates();
    },

    /**
     * 更新按钮状态
     */
    _updateButtonStates() {
        const hasImage = this._state !== 'idle';
        const hasPieces = this._state === 'readyExport';

        this._elements.previewBtn.disabled = !hasImage;
        this._elements.cutBtn.disabled = !hasImage;
        this._elements.downloadSingleBtn.disabled = !hasPieces;
        this._elements.downloadZipBtn.disabled = !hasPieces;
    },

    /**
     * 显示图片信息
     */
    showImageInfo(info) {
        this._elements.imageName.textContent = info.name;
        this._elements.imageSize.textContent = `${info.width} × ${info.height} | ${FileUtils.formatFileSize(info.size)}`;
        DOM.show(this._elements.imageInfo);
    },

    /**
     * 更新切割块尺寸信息
     */
    _updatePieceSizeInfo() {
        const pieceSize = ImageProcessor.getPieceSizeInfo();
        if (pieceSize) {
            this._elements.pieceSizeInfo.innerHTML = `<span>切割块尺寸: ${pieceSize.formatted}</span>`;
        }
    },

    /**
     * 切割网格输入变化 - 实时更新预览
     */
    _onGridInputChange() {
        const cols = parseInt(this._elements.colsInput.value) || 1;
        const rows = parseInt(this._elements.rowsInput.value) || 1;

        // 同步更新滑块位置
        this._syncSliderWithValue('cols', cols);
        this._syncSliderWithValue('rows', rows);

        // 更新切割块尺寸信息
        ImageProcessor.setGrid(cols, rows);
        this._updatePieceSizeInfo();

        // 如果图片已加载且网格可见，实时更新网格线
        if (this._state !== 'idle' && this._gridVisible) {
            this.showGridOverlay();
        }
    },

    /**
     * 滑块变化
     */
    _onSliderChange(type, value) {
        const numValue = parseInt(value) || 1;

        // 更新对应的输入框
        if (type === 'cols') {
            this._elements.colsInput.value = numValue;
        } else {
            this._elements.rowsInput.value = numValue;
        }

        // 触发网格更新
        this._onGridInputChange();
    },

    /**
     * 同步滑块位置与输入框值
     */
    _syncSliderWithValue(type, value) {
        const slider = type === 'cols' ? this._elements.colsSlider : this._elements.rowsSlider;
        const max = parseInt(slider.max) || 10;

        // 如果值超过滑块上限，滑块保持在最大值
        slider.value = Math.min(value, max);
    },

    /**
     * 滑块上限变化
     */
    _onSliderMaxChange(value) {
        const maxValue = Math.max(1, Math.min(50, parseInt(value) || 10));

        // 更新滑块上限
        this._elements.colsSlider.max = maxValue;
        this._elements.rowsSlider.max = maxValue;

        // 检查当前值是否超过新上限，如果超过则调整滑块位置
        const colsValue = parseInt(this._elements.colsInput.value) || 1;
        const rowsValue = parseInt(this._elements.rowsInput.value) || 1;

        this._syncSliderWithValue('cols', colsValue);
        this._syncSliderWithValue('rows', rowsValue);
    },

    /**
     * 显示原图预览
     */
    showPreview(image) {
        const canvas = this._elements.previewCanvas;
        const wrapper = this._elements.previewWrapper;
        const container = this._elements.previewContainer;

        // 设置canvas为原图尺寸
        canvas.width = image.width;
        canvas.height = image.height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);

        // 重置平移状态
        this._panState.offsetX = 0;
        this._panState.offsetY = 0;

        // 隐藏占位符，显示 wrapper
        DOM.hide(DOM.$('.preview-placeholder', container));
        DOM.show(wrapper);

        // 更新切割块尺寸信息并显示网格线
        const cols = parseInt(this._elements.colsInput.value) || 1;
        const rows = parseInt(this._elements.rowsInput.value) || 1;
        ImageProcessor.setGrid(cols, rows);
        this._updatePieceSizeInfo();

        // 使用统一的预览工具进行自适应缩放
        const fitScale = PreviewUtils.autoFitPreview({
            container,
            canvas,
            slider: DOM.$('#previewZoomSlider'),
            valueDisplay: DOM.$('#previewZoomValue'),
            type: 'original'
        });

        // 更新缩放级别以匹配计算出的缩放值
        this._zoomLevels.preview = Math.round(fitScale * 100);

        // 将 canvas 的 scale 移到 wrapper 上，确保 canvas 和 grid-overlay 同步缩放
        const canvasScale = canvas.style.transform;
        if (canvasScale) {
            canvas.style.transform = '';
            canvas.style.transformOrigin = '';
            wrapper.style.transform = `translate(0px, 0px) scale(${fitScale})`;
            wrapper.style.transformOrigin = 'center center';
        }

        // 显示网格线（在 wrapper 缩放后）
        this.showGridOverlay();
    },

    /**
     * 显示切割网格
     */
    showGridOverlay() {
        const canvas = this._elements.previewCanvas;
        const overlay = this._elements.gridOverlay;

        if (!canvas || !overlay) return;

        // 清除现有网格线
        DOM.empty(overlay);

        const displayWidth = canvas.width;
        const displayHeight = canvas.height;
        const cols = parseInt(this._elements.colsInput.value) || 1;
        const rows = parseInt(this._elements.rowsInput.value) || 1;

        // 设置网格覆盖层尺寸与 canvas 一致
        DOM.setStyles(overlay, {
            width: displayWidth + 'px',
            height: displayHeight + 'px'
        });

        // 添加水平线
        for (let i = 1; i < rows; i++) {
            const line = DOM.createElement('div', 'grid-line-h');
            const y = (displayHeight / rows) * i;
            DOM.setStyles(line, {
                top: y + 'px'
            });
            overlay.appendChild(line);
        }

        // 添加垂直线
        for (let i = 1; i < cols; i++) {
            const line = DOM.createElement('div', 'grid-line-v');
            const x = (displayWidth / cols) * i;
            DOM.setStyles(line, {
                left: x + 'px'
            });
            overlay.appendChild(line);
        }

        // 更新状态和按钮文字
        this._gridVisible = true;
        this._updateGridPreviewBtnText();
    },

    /**
     * 隐藏网格
     */
    hideGridOverlay() {
        DOM.empty(this._elements.gridOverlay);
        this._gridVisible = false;
        this._updateGridPreviewBtnText();
    },

    /**
     * 更新预览按钮文字
     */
    _updateGridPreviewBtnText() {
        const btn = this._elements.previewBtn;
        if (btn) {
            const span = btn.querySelector('span');
            if (span) {
                span.textContent = this._gridVisible ? '隐藏切割线' : '预览切割线';
            }
        }
    },

    /**
     * 显示切割结果
     */
    showPieces(pieces) {
        const grid = this._elements.pieceGrid;

        // 清除现有内容
        DOM.empty(grid);

        // 更新数量显示
        this._elements.piecesCount.textContent = `共 ${pieces.length} 块`;

        const zoom = this._zoomLevels.pieces;

        // 创建每个切割块的预览
        pieces.forEach((piece, index) => {
            const item = DOM.createElement('div', 'piece-grid__item', {
                data: { index: index }
            });
            item.style.minWidth = `${120 * zoom / 100}px`;
            item.style.minHeight = `${120 * zoom / 100}px`;

            // Canvas
            item.appendChild(piece.canvas);

            // 标签
            const label = DOM.createElement('span', 'piece-grid__label', {
                textContent: String(index + 1).padStart(3, '0')
            });
            item.appendChild(label);

            // 下载按钮
            const downloadBtn = DOM.createElement('button', 'piece-grid__download', {
                textContent: '↓',
                title: '下载此图'
            });
            DOM.on(downloadBtn, 'click', (e) => {
                e.stopPropagation();
                this._downloadPiece(index);
            });
            item.appendChild(downloadBtn);

            // 点击下载
            DOM.on(item, 'click', () => this._downloadPiece(index));

            grid.appendChild(item);
        });

        // 显示切割结果区域
        DOM.show(this._elements.piecesSection);
    },

    /**
     * 下载单个切割块
     */
    async _downloadPiece(index) {
        try {
            await ImageExporter.downloadSingle(index);
            this.showToast(`已下载 ${index + 1}. ${ImageExporter.generateFileName(index)}`, 'success');
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    /**
     * 预览按钮点击 - 切换网格线显示
     */
    _onPreviewClick() {
        if (this._gridVisible) {
            this.hideGridOverlay();
        } else {
            const cols = parseInt(this._elements.colsInput.value) || 1;
            const rows = parseInt(this._elements.rowsInput.value) || 1;
            ImageProcessor.setGrid(cols, rows);
            this.showGridOverlay();
        }
    },

    /**
     * 切割按钮点击
     */
    async _onCutClick() {
        const cols = parseInt(this._elements.colsInput.value) || 1;
        const rows = parseInt(this._elements.rowsInput.value) || 1;

        ImageProcessor.setGrid(cols, rows);

        this.showLoading('正在切割...');

        // 使用 setTimeout 让 UI 有时间更新
        setTimeout(() => {
            try {
                const pieces = ImageProcessor.renderAllPieces();

                // 设置导出模块
                ImageExporter.setPieces(pieces);
                ImageExporter.setFormat(this._getSelectedFormat());
                ImageExporter.setNamingRule(this._elements.prefixInput.value, CONFIG.DEFAULT_PADDING);

                // 显示切割结果
                this.showPieces(pieces);

                // 更新状态
                this.setState('readyExport');

                this.hideLoading();
                this.showToast(`切割完成，共 ${pieces.length} 块`, 'success');

            } catch (error) {
                this.hideLoading();
                this.showToast('切割失败: ' + error.message, 'error');
            }
        }, 50);
    },

    /**
     * 获取选中的格式
     */
    _getSelectedFormat() {
        const selected = this._elements.formatRadios.find(r => r.checked);
        return selected ? selected.value : 'png';
    },

    /**
     * 下载单个按钮点击
     */
    async _onDownloadSingleClick() {
        if (ImageProcessor.getPieces().length > 0) {
            await this._downloadPiece(0);
        }
    },

    /**
     * ZIP 下载按钮点击
     */
    async _onDownloadZipClick() {
        this.showProgress('正在打包...');

        try {
            await ImageExporter.downloadAllAsZip((percent) => {
                this.updateProgress(percent);
            });

            this.hideProgress();
            this.showToast('ZIP 打包下载完成', 'success');

        } catch (error) {
            this.hideProgress();
            this.showToast(error.message, 'error');
        }
    },

    /**
     * 显示加载状态
     */
    showLoading(text = '处理中...') {
        this._elements.loadingText.textContent = text;
        DOM.show(this._elements.loadingOverlay);
    },

    /**
     * 隐藏加载状态
     */
    hideLoading() {
        DOM.hide(this._elements.loadingOverlay);
    },

    /**
     * 显示进度条
     */
    showProgress(text = '处理中...') {
        this._elements.progressText.textContent = text;
        this._elements.progressFill.style.width = '0%';
        DOM.show(this._elements.progressBar);
    },

    /**
     * 更新进度
     */
    updateProgress(percent) {
        this._elements.progressFill.style.width = percent + '%';
        this._elements.progressText.textContent = percent + '%';
    },

    /**
     * 隐藏进度条
     */
    hideProgress() {
        DOM.hide(this._elements.progressBar);
    },

    /**
     * 显示 Toast 提示
     */
    showToast(message, type = 'info') {
        const icons = {
            success: '✓',
            error: '✗',
            warning: '⚠',
            info: 'ℹ'
        };

        const toast = DOM.createElement('div', `toast toast--${type}`, {
            innerHTML: `
                <span class="toast__icon">${icons[type] || icons.info}</span>
                <span class="toast__message">${message}</span>
            `
        });

        this._elements.toastContainer.appendChild(toast);

        // 自动移除
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, CONFIG.TOAST_DURATION);
    },

    /**
     * 设置自动检测的网格值
     * @param {Object} detection - 检测结果 { cols, rows, confidence, method, objectCount }
     */
    setAutoDetectedGrid(detection) {
        if (!detection) return;

        const { cols, rows, confidence, method, objectCount } = detection;

        // 只在置信度足够高时自动设置
        if (confidence > 0.3) {
            this._elements.colsInput.value = cols;
            this._elements.rowsInput.value = rows;

            // 同步滑块
            this._syncSliderWithValue('cols', cols);
            this._syncSliderWithValue('rows', rows);

            // 更新切割块尺寸信息
            ImageProcessor.setGrid(cols, rows);
            this._updatePieceSizeInfo();

            // 显示检测提示
            const methodNames = {
                transparent: '透明背景检测',
                background: '背景色分离检测',
                gridPattern: '网格规律分析',
                sizeHint: '尺寸推算',
                default: '默认值'
            };

            const methodName = methodNames[method] || '智能识别';
            const objectInfo = objectCount ? `，检测到 ${objectCount} 个主体` : '';

            this.showToast(
                `自动识别: ${cols}列 × ${rows}行 (${methodName}${objectInfo})`,
                confidence > 0.6 ? 'success' : 'info'
            );
        } else {
            // 置信度过低，提示用户
            this.showToast('无法准确识别主体，请手动调整行列数', 'warning');
        }
    },

    /**
     * 重置 UI
     */
    reset() {
        this.setState('idle');
        this.hideGridOverlay();
        DOM.hide(this._elements.imageInfo);
        DOM.hide(this._elements.piecesSection);

        const container = this._elements.previewContainer;
        DOM.show(DOM.$('.preview-placeholder', container));
        DOM.hide(this._elements.previewWrapper);

        this._elements.colsInput.value = '3';
        this._elements.rowsInput.value = '3';
        this._elements.pieceSizeInfo.innerHTML = '<span>切割块尺寸: --</span>';

        // 重置缩放
        this._zoomLevels.preview = 100;
        this._zoomLevels.pieces = 100;

        // 重置平移
        this._panState.offsetX = 0;
        this._panState.offsetY = 0;
        this._panState.isDragging = false;

        // 重置变换
        this._updatePreviewTransform();

        const previewSlider = DOM.$('#previewZoomSlider');
        const previewValue = DOM.$('#previewZoomValue');
        const piecesSlider = DOM.$('#piecesZoomSlider');
        const piecesValue = DOM.$('#piecesZoomValue');

        if (previewSlider) previewSlider.value = 100;
        if (previewValue) previewValue.textContent = '100%';
        if (piecesSlider) piecesSlider.value = 100;
        if (piecesValue) piecesValue.textContent = '100%';
    }
};
