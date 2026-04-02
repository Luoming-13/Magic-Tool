/**
 * Sprite Sheet UI Controller
 *
 * 负责界面交互和状态管理
 */

const SpriteSheetUI = {
    currentMode: 'split',  // 'multi' | 'split' - 默认单图拆分模式
    splitSubMode: 'cut',   // 'cut' | 'compose' - 单图拆分模式的子模式
    draggedItem: null,
    draggedIndex: null,
    zoomLevels: {
        multi: 100,
        split: 100,
        result: 100,
        source: 100  // 原图缩放
    },
    // 平移状态
    panStates: {
        multi: { x: 0, y: 0 },
        result: { x: 0, y: 0 },
        source: { x: 0, y: 0 }  // 原图平移
    },
    panActiveContainer: null,  // 当前正在拖拽的容器标识
    panStartX: 0,
    panStartY: 0,
    // 切割状态
    splitCutterState: {
        hasSplit: false,
        gridImageData: [],
        gridVisible: true  // 切割线默认显示
    },

    /**
     * 初始化
     */
    init() {
        this.bindModeSwitch();
        this.bindMultiUpload();
        this.bindSplitUpload();
        this.bindSplitCutSettings();
        this.bindSplitComposeSettings();
        this.bindSettings();
        this.bindExport();
        this.bindZoomControls();
        this.bindRearrange();
        this.bindWheelZoom();
        this.bindPanControls();
        // 初始化导出按钮显示
        this.updateExportButtonDisplay();
    },

    /**
     * 绑定重新排列按钮
     */
    bindRearrange() {
        const rearrangeBtn = document.getElementById('rearrangeBtn');
        if (!rearrangeBtn) return;

        rearrangeBtn.addEventListener('click', () => {
            if (!SpriteSheet.sourceImage) return;

            // 重新拆分并排列
            const splits = SpriteSheet.reSplitAndArrange();
            this.saveOriginalSplitSettings();
            this.hideRearrangeButton();
            this.renderSplitGrid(splits);
            this.renderSplitPreview();
            this.showToast('已重新排列', 'success');
        });
    },

    /**
     * 显示重新排列按钮
     */
    showRearrangeButton() {
        const btn = document.getElementById('rearrangeBtn');
        if (btn) btn.style.display = 'inline-flex';
    },

    /**
     * 隐藏重新排列按钮
     */
    hideRearrangeButton() {
        const btn = document.getElementById('rearrangeBtn');
        if (btn) btn.style.display = 'none';
    },

    /**
     * 绑定滚轮缩放
     */
    bindWheelZoom() {
        // 多图模式预览窗滚轮缩放
        this._bindWheelZoomForContainer('multiPreviewContainer', 'multi', 'multiPreviewCanvas');
        // 单图拆分合成预览窗滚轮缩放
        this._bindWheelZoomForContainer('splitResultContainer', 'result', 'splitPreviewCanvas');
        // 原图窗口滚轮缩放
        this._bindWheelZoomForSource();
    },

    /**
     * 绑定原图窗口滚轮缩放
     */
    _bindWheelZoomForSource() {
        const container = document.getElementById('splitPreviewContainer');
        if (!container) return;

        container.addEventListener('wheel', (e) => {
            // 阻止页面滚动
            e.preventDefault();

            // 计算新的缩放值
            const delta = e.deltaY > 0 ? -10 : 10;
            const newZoom = Math.max(10, Math.min(200, this.zoomLevels.source + delta));

            // 如果值没有变化，不执行后续操作
            if (newZoom === this.zoomLevels.source) return;

            // 更新缩放值
            this.zoomLevels.source = newZoom;

            // 同步更新滑块和显示值
            const slider = document.getElementById('sourceZoomSlider');
            const valueDisplay = document.getElementById('sourceZoomValue');
            if (slider) slider.value = newZoom;
            if (valueDisplay) valueDisplay.textContent = `${newZoom}%`;

            // 应用变换
            this._applySourceTransform();
        });
    },

    /**
     * 应用原图变换（缩放+平移）
     */
    _applySourceTransform() {
        const wrapper = document.getElementById('splitPreviewWrapper');
        if (!wrapper) return;

        const zoom = this.zoomLevels.source / 100;
        const pan = this.panStates.source;
        wrapper.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
        wrapper.style.transformOrigin = 'center center';
    },

    /**
     * 绑定平移控制
     */
    bindPanControls() {
        // 多图模式预览窗平移
        this._bindPanForContainer('multiPreviewContainer', 'multi', 'multiPreviewCanvas');
        // 单图拆分合成预览窗平移
        this._bindPanForContainer('splitResultContainer', 'result', 'splitPreviewCanvas');
        // 原图窗口平移
        this._bindPanForSource();
    },

    /**
     * 绑定原图窗口平移
     */
    _bindPanForSource() {
        const container = document.getElementById('splitPreviewContainer');
        const wrapper = document.getElementById('splitPreviewWrapper');
        const canvas = document.getElementById('splitSourceCanvas');
        if (!container || !wrapper) return;

        // 让 canvas 不拦截鼠标事件，使事件能够到达容器
        if (canvas) {
            canvas.style.pointerEvents = 'none';
        }

        container.style.cursor = 'grab';

        container.addEventListener('mousedown', (e) => {
            // 只响应鼠标左键
            if (e.button !== 0) return;
            // 检查 wrapper 是否可见
            if (wrapper.style.display === 'none') return;

            this.panActiveContainer = 'source';
            this.panStartX = e.clientX;
            this.panStartY = e.clientY;
            container.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (this.panActiveContainer !== 'source') return;

            const deltaX = e.clientX - this.panStartX;
            const deltaY = e.clientY - this.panStartY;

            // 更新平移状态
            this.panStates.source.x += deltaX;
            this.panStates.source.y += deltaY;

            // 更新起始位置
            this.panStartX = e.clientX;
            this.panStartY = e.clientY;

            // 应用变换
            this._applySourceTransform();
        });

        const endPan = () => {
            if (this.panActiveContainer === 'source') {
                this.panActiveContainer = null;
                container.style.cursor = 'grab';
            }
        };

        document.addEventListener('mouseup', endPan);
        container.addEventListener('mouseleave', endPan);
    },

    /**
     * 为指定容器绑定平移功能
     */
    _bindPanForContainer(containerId, panKey, canvasId) {
        const container = document.getElementById(containerId);
        const canvas = document.getElementById(canvasId);
        if (!container || !canvas) return;

        // 让 canvas 不拦截鼠标事件，使事件能够到达容器
        canvas.style.pointerEvents = 'none';

        container.style.cursor = 'grab';

        container.addEventListener('mousedown', (e) => {
            // 只响应鼠标左键
            if (e.button !== 0) return;
            // 检查 canvas 是否可见
            if (canvas.style.display === 'none') return;

            this.panActiveContainer = panKey;
            this.panStartX = e.clientX;
            this.panStartY = e.clientY;
            container.style.cursor = 'grabbing';
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (this.panActiveContainer !== panKey) return;

            const deltaX = e.clientX - this.panStartX;
            const deltaY = e.clientY - this.panStartY;

            // 更新平移状态
            this.panStates[panKey].x += deltaX;
            this.panStates[panKey].y += deltaY;

            // 更新起始位置
            this.panStartX = e.clientX;
            this.panStartY = e.clientY;

            // 应用变换
            this._applyCanvasTransform(canvas, panKey);
        });

        const endPan = () => {
            if (this.panActiveContainer === panKey) {
                this.panActiveContainer = null;
                container.style.cursor = 'grab';
            }
        };

        document.addEventListener('mouseup', endPan);
        container.addEventListener('mouseleave', endPan);
    },

    /**
     * 应用canvas变换（缩放+平移）
     */
    _applyCanvasTransform(canvas, key) {
        const zoom = this.zoomLevels[key] / 100;
        const pan = this.panStates[key];
        canvas.style.transform = `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`;
        canvas.style.transformOrigin = 'center center';
    },

    /**
     * 重置指定容器的平移状态
     */
    resetPanState(key) {
        this.panStates[key] = { x: 0, y: 0 };
    },

    /**
     * 为指定容器绑定滚轮缩放
     */
    _bindWheelZoomForContainer(containerId, zoomKey, canvasId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.addEventListener('wheel', (e) => {
            // 阻止页面滚动
            e.preventDefault();

            // 计算新的缩放值
            const delta = e.deltaY > 0 ? -10 : 10;
            const newZoom = Math.max(10, Math.min(200, this.zoomLevels[zoomKey] + delta));

            // 如果值没有变化，不执行后续操作
            if (newZoom === this.zoomLevels[zoomKey]) return;

            // 更新缩放值
            this.zoomLevels[zoomKey] = newZoom;

            // 同步更新滑块和显示值
            const sliderId = zoomKey === 'multi' ? 'multiZoomSlider' : 'resultZoomSlider';
            const valueId = zoomKey === 'multi' ? 'multiZoomValue' : 'resultZoomValue';

            const slider = document.getElementById(sliderId);
            const valueDisplay = document.getElementById(valueId);
            if (slider) slider.value = newZoom;
            if (valueDisplay) valueDisplay.textContent = `${newZoom}%`;

            // 应用变换（缩放+平移）
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                this._applyCanvasTransform(canvas, zoomKey);
            }
        });
    },

    /**
     * 绑定缩放控制
     */
    bindZoomControls() {
        const sliders = [
            { slider: 'multiZoomSlider', value: 'multiZoomValue', key: 'multi', canvas: 'multiPreviewCanvas' },
            { slider: 'splitZoomSlider', value: 'splitZoomValue', key: 'split', rerender: 'splitGrid' },
            { slider: 'resultZoomSlider', value: 'resultZoomValue', key: 'result', canvas: 'splitPreviewCanvas' },
            { slider: 'sourceZoomSlider', value: 'sourceZoomValue', key: 'source', isSource: true }
        ];

        sliders.forEach(({ slider, value, key, canvas, rerender, isSource }) => {
            const sliderEl = document.getElementById(slider);
            const valueEl = document.getElementById(value);

            if (!sliderEl) return;

            sliderEl.addEventListener('input', () => {
                const zoom = parseInt(sliderEl.value);
                this.zoomLevels[key] = zoom;
                valueEl.textContent = `${zoom}%`;

                if (isSource) {
                    this._applySourceTransform();
                } else if (canvas) {
                    const canvasEl = document.getElementById(canvas);
                    if (canvasEl) {
                        this._applyCanvasTransform(canvasEl, key);
                    }
                }

                if (rerender === 'splitGrid' && SpriteSheet.splitImages.length > 0) {
                    // 重新渲染拆分网格以应用新缩放
                    this.renderSplitGrid(SpriteSheet.splitImages);
                }
            });
        });
    },

    /**
     * 绑定模式切换
     */
    bindModeSwitch() {
        const modeBtns = document.querySelectorAll('.mode-nav__btn');

        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                if (mode === this.currentMode) return;

                // 更新按钮状态
                modeBtns.forEach(b => b.classList.remove('mode-nav__btn--active'));
                btn.classList.add('mode-nav__btn--active');

                // 切换面板
                this.currentMode = mode;
                document.getElementById('multiModePanel').style.display = mode === 'multi' ? 'block' : 'none';
                document.getElementById('splitModePanel').style.display = mode === 'split' ? 'block' : 'none';
                document.getElementById('multiPreviewArea').style.display = mode === 'multi' ? 'flex' : 'none';
                document.getElementById('splitPreviewArea').style.display = mode === 'split' ? 'flex' : 'none';

                // 切换设置面板显示
                document.getElementById('composeSettingsSection').style.display = mode === 'multi' ? 'block' : 'none';
                if (mode === 'split') {
                    // 根据是否已切割决定显示哪个面板
                    if (this.splitCutterState.hasSplit) {
                        document.getElementById('splitCutSettings').style.display = 'none';
                        document.getElementById('splitComposeSettings').style.display = 'block';
                        this.splitSubMode = 'compose';
                    } else {
                        document.getElementById('splitCutSettings').style.display = 'block';
                        document.getElementById('splitComposeSettings').style.display = 'none';
                        this.splitSubMode = 'cut';
                    }
                }

                // 切换模式时保留数据，只更新 UI 显示
                if (mode === 'split') {
                    // 切换到单图拆分模式时，重新渲染现有数据
                    this.renderSplitSource();
                    if (SpriteSheet.splitImages.length > 0) {
                        this.renderSplitGrid(SpriteSheet.splitImages);
                        this.renderSplitPreview();
                    }
                    // 更新按钮状态
                    document.getElementById('previewGridBtn').disabled = !SplitCutter.getSourceImage();
                    document.getElementById('executeCutBtn').disabled = !SplitCutter.getSourceImage();
                    document.getElementById('toComposeBtn').disabled = !this.splitCutterState.hasSplit;
                } else {
                    // 切换到多图模式时，重新渲染现有数据
                    this.renderImageList();
                    this.updateImageCount();
                    this.renderMultiPreview();
                }

                // 更新导出按钮状态
                this.updateExportButton();
                this.updateExportButtonDisplay();
            });
        });
    },

    /**
     * 绑定多图上传
     */
    bindMultiUpload() {
        const uploadZone = document.getElementById('multiUploadZone');
        const fileInput = document.getElementById('multiFileInput');
        const clearBtn = document.getElementById('clearMultiBtn');

        // 点击上传
        uploadZone.addEventListener('click', () => fileInput.click());

        // 文件选择
        fileInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                await this.handleMultiFiles(e.target.files);
            }
        });

        // 拖拽上传
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('upload-zone--dragover');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('upload-zone--dragover');
        });

        uploadZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            uploadZone.classList.remove('upload-zone--dragover');
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            if (files.length > 0) {
                await this.handleMultiFiles(files);
            }
        });

        // 清空按钮
        clearBtn.addEventListener('click', () => {
            SpriteSheet.resetMultiMode();
            this.renderImageList();
            this.updateImageCount();
            this.updateExportButton();
            this.renderMultiPreview();
        });
    },

    /**
     * 处理多图文件
     */
    async handleMultiFiles(files) {
        this.showLoading('正在加载图片...');
        try {
            await SpriteSheet.addImages(files);
            this.renderImageList();
            this.updateImageCount();
            this.updateExportButton();

            // 自动计算单元格尺寸
            const size = SpriteSheet.autoCalculateCellSize();
            document.getElementById('cellWidth').value = size.width || '';
            document.getElementById('cellHeight').value = size.height || '';

            this.renderMultiPreview();
        } finally {
            this.hideLoading();
        }
    },

    /**
     * 渲染图片列表
     */
    renderImageList() {
        const container = document.getElementById('imageList');

        if (SpriteSheet.images.length === 0) {
            container.innerHTML = `
                <div class="image-list-placeholder">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                        <circle cx="8.5" cy="8.5" r="1.5"></circle>
                        <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                </div>
            `;
            return;
        }

        container.innerHTML = SpriteSheet.images.map((item, index) => `
            <div class="image-list-item" draggable="true" data-index="${index}">
                <img src="${item.img.src}" alt="${item.name}">
                <span class="image-list-item__index">${index + 1}</span>
                <button class="image-list-item__remove" data-index="${index}">×</button>
            </div>
        `).join('');

        // 绑定拖拽排序
        this.bindDragSort(container, '.image-list-item', (from, to) => {
            SpriteSheet.reorderImages(from, to);
            this.renderImageList();
            this.renderMultiPreview();
        });

        // 绑定删除按钮
        container.querySelectorAll('.image-list-item__remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const index = parseInt(btn.dataset.index);
                SpriteSheet.removeImage(index);
                this.renderImageList();
                this.updateImageCount();
                this.updateExportButton();
                this.renderMultiPreview();
            });
        });
    },

    /**
     * 绑定拖拽排序
     */
    bindDragSort(container, selector, onReorder) {
        const items = container.querySelectorAll(selector);

        items.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                this.draggedItem = item;
                this.draggedIndex = parseInt(item.dataset.newIndex ?? item.dataset.index);
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                container.querySelectorAll(selector).forEach(i => i.classList.remove('drag-over'));
                this.draggedItem = null;
                this.draggedIndex = null;
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (this.draggedItem && this.draggedItem !== item) {
                    item.classList.add('drag-over');
                }
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('drag-over');
                const toIndex = parseInt(item.dataset.newIndex ?? item.dataset.index);
                if (this.draggedIndex !== null && this.draggedIndex !== toIndex) {
                    onReorder(this.draggedIndex, toIndex);
                }
            });
        });
    },

    /**
     * 更新图片计数
     */
    updateImageCount() {
        const countEl = document.getElementById('imageCount');
        const numEl = document.getElementById('imageCountNum');

        if (SpriteSheet.images.length > 0) {
            countEl.style.display = 'flex';
            numEl.textContent = SpriteSheet.images.length;
        } else {
            countEl.style.display = 'none';
        }
    },

    /**
     * 渲染多图预览
     */
    renderMultiPreview() {
        const container = document.getElementById('multiPreviewContainer');
        const canvas = document.getElementById('multiPreviewCanvas');

        if (SpriteSheet.images.length === 0) {
            canvas.style.display = 'none';
            container.querySelector('.preview-placeholder').style.display = 'flex';
            return;
        }

        container.querySelector('.preview-placeholder').style.display = 'none';
        canvas.style.display = 'block';

        const result = SpriteSheet.composeMultiImages();
        canvas.width = result.width;
        canvas.height = result.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(result, 0, 0);

        // 应用当前缩放和平移
        this._applyCanvasTransform(canvas, 'multi');

        this.updateOutputSize();
    },

    /**
     * 绑定单图上传
     */
    bindSplitUpload() {
        const uploadZone = document.getElementById('splitUploadZone');
        const fileInput = document.getElementById('splitFileInput');

        uploadZone.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                await this.handleSplitFile(e.target.files[0]);
            }
        });

        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('upload-zone--dragover');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('upload-zone--dragover');
        });

        uploadZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            uploadZone.classList.remove('upload-zone--dragover');
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
            if (files.length > 0) {
                await this.handleSplitFile(files[0]);
            }
        });
    },

    /**
     * 绑定切割设置
     */
    bindSplitCutSettings() {
        const colsInput = document.getElementById('splitColsInput');
        const colsSlider = document.getElementById('splitColsSlider');
        const rowsInput = document.getElementById('splitRowsInput');
        const rowsSlider = document.getElementById('splitRowsSlider');
        const sliderMaxInput = document.getElementById('splitSliderMax');
        const previewBtn = document.getElementById('previewGridBtn');
        const executeBtn = document.getElementById('executeCutBtn');
        const toComposeBtn = document.getElementById('toComposeBtn');

        if (!colsInput || !rowsInput) return;

        // 输入变化时更新网格线预览
        const updateGridPreview = () => {
            const cols = parseInt(colsInput.value) || 4;
            const rows = parseInt(rowsInput.value) || 4;

            SplitCutter.setGrid(cols, rows);
            this.updateSplitPieceSizeInfo();

            // 只有在网格可见时才更新显示
            if (SplitCutter.getSourceImage() && this.splitCutterState.gridVisible) {
                this.showSplitGridOverlay();
            }
        };

        // 同步滑块和输入框
        colsInput.addEventListener('input', () => {
            colsSlider.value = Math.min(colsInput.value, colsSlider.max);
            updateGridPreview();
        });
        colsSlider.addEventListener('input', () => {
            colsInput.value = colsSlider.value;
            updateGridPreview();
        });
        rowsInput.addEventListener('input', () => {
            rowsSlider.value = Math.min(rowsInput.value, rowsSlider.max);
            updateGridPreview();
        });
        rowsSlider.addEventListener('input', () => {
            rowsInput.value = rowsSlider.value;
            updateGridPreview();
        });

        // 滑块上限
        sliderMaxInput.addEventListener('input', () => {
            const max = parseInt(sliderMaxInput.value) || 10;
            SplitCutter.setSliderMax(max);
            colsSlider.max = max;
            rowsSlider.max = max;
            colsSlider.value = Math.min(colsInput.value, max);
            rowsSlider.value = Math.min(rowsInput.value, max);
        });

        // 预览按钮 - 切换网格线显示
        previewBtn.addEventListener('click', () => {
            this.toggleSplitGridOverlay();
        });

        // 执行切割按钮
        executeBtn.addEventListener('click', () => {
            this.executeSplitCut();
        });

        // 合成按钮（切换到合成设置）
        toComposeBtn.addEventListener('click', () => {
            if (!this.splitCutterState.hasSplit) {
                // 如果还没切割，先执行切割
                this.executeSplitCut();
            }
            this.switchToSplitCompose();
        });
    },

    /**
     * 切换到合成设置（单图拆分模式内）
     */
    switchToSplitCompose() {
        document.getElementById('splitCutSettings').style.display = 'none';
        document.getElementById('splitComposeSettings').style.display = 'block';

        // 更新子模式状态
        this.splitSubMode = 'compose';
        this.updateExportButtonDisplay();

        // 同步切割参数到合成设置
        const { cols, rows } = SplitCutter.getGridSize();
        const pieceSize = SplitCutter.getPieceSizeInfo();

        document.getElementById('splitComposeColsInput').value = cols;
        document.getElementById('splitComposeColsSlider').value = Math.min(cols, 10);
        document.getElementById('splitComposeRowsInput').value = rows;
        document.getElementById('splitComposeRowsSlider').value = Math.min(rows, 10);

        if (pieceSize) {
            document.getElementById('splitCellWidth').value = pieceSize.width;
            document.getElementById('splitCellHeight').value = pieceSize.height;
        }

        // 更新 SpriteSheet 参数
        SpriteSheet.cols = cols;
        SpriteSheet.rows = rows;
        if (pieceSize) {
            SpriteSheet.cellWidth = pieceSize.width;
            SpriteSheet.cellHeight = pieceSize.height;
        }

        this.updateSplitOutputSize();
        this.renderSplitPreview();
    },

    /**
     * 切换回切割设置
     */
    switchToSplitCut() {
        document.getElementById('splitComposeSettings').style.display = 'none';
        document.getElementById('splitCutSettings').style.display = 'block';

        // 更新子模式状态
        this.splitSubMode = 'cut';
        this.updateExportButtonDisplay();
    },

    /**
     * 绑定合成按钮
     */
    bindComposeButton() {
        // 多图模式的合成按钮已移除，此方法保留用于兼容
    },

    /**
     * 绑定单图拆分模式的合成设置
     */
    bindSplitComposeSettings() {
        const colsInput = document.getElementById('splitComposeColsInput');
        const colsSlider = document.getElementById('splitComposeColsSlider');
        const rowsInput = document.getElementById('splitComposeRowsInput');
        const rowsSlider = document.getElementById('splitComposeRowsSlider');
        const cellWidth = document.getElementById('splitCellWidth');
        const cellHeight = document.getElementById('splitCellHeight');
        const paddingInput = document.getElementById('splitPaddingInput');
        const backBtn = document.getElementById('backToCutBtn');

        if (!colsInput || !rowsInput) return;

        const updateSettings = () => {
            const newCols = parseInt(colsInput.value) || 4;
            const newRows = parseInt(rowsInput.value) || 4;

            SpriteSheet.cols = newCols;
            SpriteSheet.rows = newRows;
            SpriteSheet.cellWidth = parseInt(cellWidth.value) || 0;
            SpriteSheet.cellHeight = parseInt(cellHeight.value) || 0;
            SpriteSheet.padding = parseInt(paddingInput.value) || 0;

            this.updateSplitOutputSize();

            // 当行列数变化时更新拆分网格显示
            if (SpriteSheet.splitImages.length > 0) {
                const hasChanged = (newCols !== this._originalSplitCols || newRows !== this._originalSplitRows);

                if (hasChanged) {
                    // 设置改变，显示重新排列按钮
                    this.showRearrangeButton();
                    // 更新网格显示（可能有多余空位或不足）
                    this.renderSplitGridWithPlaceholders();
                } else {
                    this.renderSplitGrid(SpriteSheet.splitImages);
                }
            }

            this.renderSplitPreview();
        };

        // 同步滑块和输入框
        colsInput.addEventListener('input', () => {
            colsSlider.value = Math.min(colsInput.value, colsSlider.max);
            updateSettings();
        });
        colsSlider.addEventListener('input', () => {
            colsInput.value = colsSlider.value;
            updateSettings();
        });
        rowsInput.addEventListener('input', () => {
            rowsSlider.value = Math.min(rowsInput.value, rowsSlider.max);
            updateSettings();
        });
        rowsSlider.addEventListener('input', () => {
            rowsInput.value = rowsSlider.value;
            updateSettings();
        });

        cellWidth.addEventListener('input', updateSettings);
        cellHeight.addEventListener('input', updateSettings);
        paddingInput.addEventListener('input', updateSettings);

        // 返回切割按钮
        backBtn.addEventListener('click', () => {
            this.switchToSplitCut();
        });
    },

    /**
     * 更新单图拆分输出尺寸显示
     */
    updateSplitOutputSize() {
        const size = SpriteSheet.calculateOutputSize();
        const el = document.getElementById('splitOutputSizeInfo');
        if (el) {
            el.innerHTML = `输出尺寸: <strong>${size.width} × ${size.height}</strong> px`;
        }
    },

    /**
     * 显示网格线覆盖层
     */
    showSplitGridOverlay() {
        const wrapper = document.getElementById('splitPreviewWrapper');
        const canvas = document.getElementById('splitSourceCanvas');
        const overlay = document.getElementById('splitGridOverlay');

        if (!canvas || !overlay) return;

        // 清除现有网格线
        overlay.innerHTML = '';

        const displayWidth = canvas.width;
        const displayHeight = canvas.height;
        const { cols, rows } = SplitCutter.getGridSize();

        // 设置覆盖层尺寸
        overlay.style.width = displayWidth + 'px';
        overlay.style.height = displayHeight + 'px';

        // 添加水平线
        for (let i = 1; i < rows; i++) {
            const line = document.createElement('div');
            line.className = 'grid-line-h';
            line.style.top = (displayHeight / rows) * i + 'px';
            overlay.appendChild(line);
        }

        // 添加垂直线
        for (let i = 1; i < cols; i++) {
            const line = document.createElement('div');
            line.className = 'grid-line-v';
            line.style.left = (displayWidth / cols) * i + 'px';
            overlay.appendChild(line);
        }

        // 更新状态和按钮文字
        this.splitCutterState.gridVisible = true;
        this.updateGridPreviewBtnText();
    },

    /**
     * 隐藏网格线覆盖层
     */
    hideSplitGridOverlay() {
        const overlay = document.getElementById('splitGridOverlay');
        if (overlay) {
            overlay.innerHTML = '';
        }
        this.splitCutterState.gridVisible = false;
        this.updateGridPreviewBtnText();
    },

    /**
     * 切换网格线显示
     */
    toggleSplitGridOverlay() {
        if (this.splitCutterState.gridVisible) {
            this.hideSplitGridOverlay();
        } else {
            this.showSplitGridOverlay();
        }
    },

    /**
     * 更新预览按钮文字
     */
    updateGridPreviewBtnText() {
        const btn = document.getElementById('previewGridBtn');
        if (btn) {
            const span = btn.querySelector('span');
            if (span) {
                span.textContent = this.splitCutterState.gridVisible ? '隐藏切割线' : '预览切割线';
            }
        }
    },

    /**
     * 更新切割块尺寸信息
     */
    updateSplitPieceSizeInfo() {
        const info = SplitCutter.getPieceSizeInfo();
        const el = document.getElementById('splitPieceSizeInfo');
        if (el && info) {
            el.innerHTML = `切割块尺寸: ${info.formatted}`;
        }
    },

    /**
     * 执行切割
     */
    executeSplitCut() {
        if (!SplitCutter.getSourceImage()) return;

        this.showLoading('正在切割...');

        setTimeout(() => {
            try {
                const pieces = SplitCutter.executeSplit();

                // 保存切割结果
                this.splitCutterState.hasSplit = true;
                this.splitCutterState.gridImageData = SplitCutter.getGridImageData();

                // 更新 SpriteSheet 的拆分数据
                SpriteSheet.splitImages = pieces.map((p, i) => ({
                    canvas: p.canvas,
                    index: i,
                    row: p.row,
                    col: p.col
                }));
                SpriteSheet.splitOrder = pieces.map((_, i) => i);

                // 更新设置参数
                const { cols, rows } = SplitCutter.getGridSize();
                SpriteSheet.cols = cols;
                SpriteSheet.rows = rows;
                const pieceSize = SplitCutter.getPieceSizeInfo();
                SpriteSheet.cellWidth = pieceSize.width;
                SpriteSheet.cellHeight = pieceSize.height;

                // 保存原始拆分设置，用于检测后续变化
                this.saveOriginalSplitSettings();

                // 渲染拆分结果
                this.renderSplitGrid(SpriteSheet.splitImages);
                this.renderSplitPreview();

                // 启用合成按钮
                document.getElementById('toComposeBtn').disabled = false;

                this.updateExportButton();
                this.hideLoading();
                this.showToast(`切割完成，共 ${pieces.length} 块`, 'success');

            } catch (error) {
                this.hideLoading();
                this.showToast('切割失败: ' + error.message, 'error');
            }
        }, 50);
    },

    /**
     * 处理单图文件
     */
    async handleSplitFile(file) {
        this.showLoading('正在加载图片...');
        try {
            const result = await SpriteSheet.setSourceImage(file);


            // 设置 SplitCutter 的源图片
            SplitCutter.setSourceImage(result);

            // 重置缩放和平移状态
            this.zoomLevels.source = 100;
            this.panStates.source = { x: 0, y: 0 };

            // 同步更新 UI 控件
            const slider = document.getElementById('sourceZoomSlider');
            const valueDisplay = document.getElementById('sourceZoomValue');
            if (slider) slider.value = 100;
            if (valueDisplay) valueDisplay.textContent = '100%';

            // 显示源图
            this.renderSplitSource();

            // 智能网格检测
            if (typeof GridDetector !== 'undefined') {
                const detection = GridDetector.detect(result.img);

                if (detection.confidence > 0.3) {
                    document.getElementById('splitColsInput').value = detection.cols;
                    document.getElementById('splitRowsInput').value = detection.rows;
                    document.getElementById('splitColsSlider').value = Math.min(detection.cols, 10);
                    document.getElementById('splitRowsSlider').value = Math.min(detection.rows, 10);
                    SplitCutter.setGrid(detection.cols, detection.rows);

                    const methodNames = {
                        transparent: '透明背景检测',
                        background: '背景色分离检测',
                        gridPattern: '网格规律分析',
                        sizeHint: '尺寸推算'
                    };
                    this.showToast(
                        `自动识别: ${detection.cols}列 × ${detection.rows}行 (${methodNames[detection.method] || '智能识别'})`,
                        detection.confidence > 0.6 ? 'success' : 'info'
                    );
                }
            }

            // 更新切割块尺寸信息
            this.updateSplitPieceSizeInfo();

            // 显示网格线预览
            this.showSplitGridOverlay();

            // 启用按钮
            document.getElementById('previewGridBtn').disabled = false;
            document.getElementById('executeCutBtn').disabled = false;

            this.updateExportButton();
        } catch (error) {
            this.showToast(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    },

    /**
     * 渲染源图
     */
    renderSplitSource() {
        const container = document.getElementById('splitPreviewContainer');
        const wrapper = document.getElementById('splitPreviewWrapper');
        const canvas = document.getElementById('splitSourceCanvas');

        if (!SpriteSheet.sourceImage) {
            wrapper.style.display = 'none';
            container.querySelector('.preview-placeholder').style.display = 'flex';
            return;
        }

        container.querySelector('.preview-placeholder').style.display = 'none';
        wrapper.style.display = 'block';

        const { img } = SpriteSheet.sourceImage;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        // 应用当前缩放和平移
        this._applySourceTransform();
    },

    /**
     * 执行拆分
     */
    performSplit() {
        if (!SpriteSheet.sourceImage) return;

        const splits = SpriteSheet.splitSourceImage();
        this.saveOriginalSplitSettings();
        this.hideRearrangeButton();
        this.renderSplitGrid(splits);
        this.renderSplitPreview();
    },

    /**
     * 删除拆分帧
     */
    removeSplitFrame(newIndex) {
        // 从splitOrder中移除指定索引
        SpriteSheet.splitOrder.splice(newIndex, 1);
        // 重新渲染
        this.renderSplitGrid(SpriteSheet.splitImages);
        this.renderSplitPreview();
        this.updateExportButton();
    },

    /**
     * 渲染拆分网格
     */
    renderSplitGrid(splits) {
        const container = document.getElementById('splitGrid');

        if (!splits || splits.length === 0) {
            container.innerHTML = '';
            return;
        }

        const zoom = this.zoomLevels.split;
        const itemSize = Math.max(60, 80 * zoom / 100);

        container.style.gridTemplateColumns = `repeat(${SpriteSheet.cols}, ${itemSize}px)`;

        container.innerHTML = SpriteSheet.splitOrder.map((originalIndex, newIndex) => {
            const item = splits[originalIndex];
            if (!item) return '';
            return `
                <div class="split-grid-item" data-new-index="${newIndex}" data-original-index="${originalIndex}" style="min-width: ${itemSize}px; min-height: ${itemSize}px;">
                    <canvas width="${item.canvas.width}" height="${item.canvas.height}"></canvas>
                    <span class="split-grid-item__index">${newIndex + 1}</span>
                    <div class="split-grid-item__actions">
                        <button class="split-grid-item__action split-grid-item__action--delete" data-new-index="${newIndex}" title="删除此帧">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                        <button class="split-grid-item__action split-grid-item__action--move" data-new-index="${newIndex}" title="拖拽移动顺序">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="9" cy="5" r="1"/>
                                <circle cx="9" cy="12" r="1"/>
                                <circle cx="9" cy="19" r="1"/>
                                <circle cx="15" cy="5" r="1"/>
                                <circle cx="15" cy="12" r="1"/>
                                <circle cx="15" cy="19" r="1"/>
                            </svg>
                        </button>
                    </div>
                    <button class="split-grid-item__download" data-original-index="${originalIndex}" title="下载此帧">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');

        // 绘制canvas内容
        container.querySelectorAll('.split-grid-item').forEach(el => {
            const originalIndex = parseInt(el.dataset.originalIndex);
            const canvas = el.querySelector('canvas');
            const ctx = canvas.getContext('2d');
            ctx.drawImage(splits[originalIndex].canvas, 0, 0);
        });

        // 绑定删除按钮
        container.querySelectorAll('.split-grid-item__action--delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const newIndex = parseInt(btn.dataset.newIndex);
                this.removeSplitFrame(newIndex);
            });
        });

        // 绑定下载按钮
        container.querySelectorAll('.split-grid-item__download').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const originalIndex = parseInt(btn.dataset.originalIndex);
                this.downloadSingleSplitImage(originalIndex);
            });
        });

        // 绑定移动按钮的拖拽
        this.bindMoveButtonDrag(container, splits);
    },

    /**
     * 绑定移动按钮的拖拽功能
     */
    bindMoveButtonDrag(container, splits) {
        const moveButtons = container.querySelectorAll('.split-grid-item__action--move');
        const items = container.querySelectorAll('.split-grid-item');

        moveButtons.forEach(btn => {
            btn.setAttribute('draggable', 'true');

            btn.addEventListener('dragstart', (e) => {
                const item = btn.closest('.split-grid-item');
                this.draggedItem = item;
                this.draggedIndex = parseInt(item.dataset.newIndex);
                item.classList.add('dragging');
                btn.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            btn.addEventListener('dragend', () => {
                const item = btn.closest('.split-grid-item');
                item.classList.remove('dragging');
                btn.classList.remove('dragging');
                items.forEach(i => i.classList.remove('drag-over'));
                this.draggedItem = null;
                this.draggedIndex = null;
            });
        });

        items.forEach(item => {
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (this.draggedItem && this.draggedItem !== item) {
                    item.classList.add('drag-over');
                }
            });

            item.addEventListener('dragleave', () => {
                item.classList.remove('drag-over');
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('drag-over');
                const toIndex = parseInt(item.dataset.newIndex);
                if (this.draggedIndex !== null && this.draggedIndex !== toIndex) {
                    SpriteSheet.reorderSplitImages(this.draggedIndex, toIndex);
                    this.renderSplitGrid(SpriteSheet.splitImages);
                    this.renderSplitPreview();
                }
            });
        });
    },

    /**
     * 渲染拆分后的预览
     */
    renderSplitPreview() {
        const container = document.getElementById('splitResultContainer');
        const canvas = document.getElementById('splitPreviewCanvas');

        if (SpriteSheet.splitImages.length === 0 || SpriteSheet.splitOrder.length === 0) {
            canvas.style.display = 'none';
            container.querySelector('.preview-placeholder').style.display = 'flex';
            return;
        }

        container.querySelector('.preview-placeholder').style.display = 'none';
        canvas.style.display = 'block';

        const result = SpriteSheet.composeSplitImages();
        canvas.width = result.width;
        canvas.height = result.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(result, 0, 0);

        // 应用当前缩放和平移
        this._applyCanvasTransform(canvas, 'result');

        this.updateOutputSize();
    },

    /**
     * 绑定设置
     */
    bindSettings() {
        const colsInput = document.getElementById('colsInput');
        const colsSlider = document.getElementById('colsSlider');
        const rowsInput = document.getElementById('rowsInput');
        const rowsSlider = document.getElementById('rowsSlider');
        const cellWidth = document.getElementById('cellWidth');
        const cellHeight = document.getElementById('cellHeight');
        const paddingInput = document.getElementById('paddingInput');

        // 记录原始拆分设置
        this._originalSplitCols = 0;
        this._originalSplitRows = 0;

        const updateSettings = () => {
            const newCols = parseInt(colsInput.value) || 1;
            const newRows = parseInt(rowsInput.value) || 1;

            SpriteSheet.setParams({
                cols: newCols,
                rows: newRows,
                cellWidth: parseInt(cellWidth.value) || 0,
                cellHeight: parseInt(cellHeight.value) || 0,
                padding: parseInt(paddingInput.value) || 0
            });

            this.updateOutputSize();

            if (this.currentMode === 'multi') {
                this.renderMultiPreview();
            } else if (SpriteSheet.sourceImage) {
                // 检查设置是否改变
                const totalCells = newCols * newRows;
                const hasChanged = (newCols !== this._originalSplitCols || newRows !== this._originalSplitRows);

                if (hasChanged && SpriteSheet.splitImages.length > 0) {
                    // 设置改变，显示重新排列按钮
                    this.showRearrangeButton();
                    // 更新网格显示（可能有多余空位或不足）
                    this.renderSplitGridWithPlaceholders();
                    this.renderSplitPreview();
                } else {
                    this.renderSplitGrid(SpriteSheet.splitImages);
                    this.renderSplitPreview();
                }
            }
        };

        // 同步滑块和输入框
        const syncSliderInput = (input, slider) => {
            input.addEventListener('input', () => {
                slider.value = Math.min(input.value, slider.max);
                updateSettings();
            });
            slider.addEventListener('input', () => {
                input.value = slider.value;
                updateSettings();
            });
        };

        syncSliderInput(colsInput, colsSlider);
        syncSliderInput(rowsInput, rowsSlider);

        cellWidth.addEventListener('input', updateSettings);
        cellHeight.addEventListener('input', updateSettings);
        paddingInput.addEventListener('input', updateSettings);
    },

    /**
     * 记录原始拆分设置
     */
    saveOriginalSplitSettings() {
        this._originalSplitCols = SpriteSheet.cols;
        this._originalSplitRows = SpriteSheet.rows;
    },

    /**
     * 渲染拆分网格（带占位符）
     */
    renderSplitGridWithPlaceholders() {
        const container = document.getElementById('splitGrid');
        const splits = SpriteSheet.splitImages;

        if (!splits || splits.length === 0) {
            container.innerHTML = '';
            return;
        }

        const zoom = this.zoomLevels.split;
        const itemSize = Math.max(60, 80 * zoom / 100);
        const totalCells = SpriteSheet.cols * SpriteSheet.rows;

        container.style.gridTemplateColumns = `repeat(${SpriteSheet.cols}, ${itemSize}px)`;

        let html = '';
        for (let i = 0; i < totalCells; i++) {
            if (i < SpriteSheet.splitOrder.length) {
                const originalIndex = SpriteSheet.splitOrder[i];
                const item = splits[originalIndex];
                if (item) {
                    html += `
                        <div class="split-grid-item" data-new-index="${i}" data-original-index="${originalIndex}" style="min-width: ${itemSize}px; min-height: ${itemSize}px;">
                            <canvas width="${item.canvas.width}" height="${item.canvas.height}"></canvas>
                            <span class="split-grid-item__index">${i + 1}</span>
                            <div class="split-grid-item__actions">
                                <button class="split-grid-item__action split-grid-item__action--delete" data-new-index="${i}" title="删除此帧">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M18 6L6 18M6 6l12 12"/>
                                    </svg>
                                </button>
                                <button class="split-grid-item__action split-grid-item__action--move" data-new-index="${i}" title="拖拽移动顺序">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="9" cy="5" r="1"/>
                                        <circle cx="9" cy="12" r="1"/>
                                        <circle cx="9" cy="19" r="1"/>
                                        <circle cx="15" cy="5" r="1"/>
                                        <circle cx="15" cy="12" r="1"/>
                                        <circle cx="15" cy="19" r="1"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `;
                }
            } else {
                // 占位符（空白帧）
                html += `
                    <div class="split-grid-item split-grid-item--placeholder" style="min-width: ${itemSize}px; min-height: ${itemSize}px;">
                        <div class="split-grid-placeholder">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="M12 8v8M8 12h8"/>
                            </svg>
                        </div>
                        <span class="split-grid-item__index">${i + 1}</span>
                    </div>
                `;
            }
        }

        container.innerHTML = html;

        // 绘制canvas内容
        container.querySelectorAll('.split-grid-item:not(.split-grid-item--placeholder)').forEach(el => {
            const originalIndex = parseInt(el.dataset.originalIndex);
            const canvas = el.querySelector('canvas');
            const ctx = canvas.getContext('2d');
            ctx.drawImage(splits[originalIndex].canvas, 0, 0);
        });

        // 绑定删除按钮
        container.querySelectorAll('.split-grid-item__action--delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const newIndex = parseInt(btn.dataset.newIndex);
                this.removeSplitFrame(newIndex);
            });
        });

        // 绑定移动按钮的拖拽
        this.bindMoveButtonDrag(container, splits);
    },

    /**
     * 更新输出尺寸显示
     */
    updateOutputSize() {
        const size = SpriteSheet.calculateOutputSize();
        document.getElementById('outputSizeInfo').innerHTML = `输出尺寸: <strong>${size.width} × ${size.height}</strong> px`;
    },

    /**
     * 绑定导出
     */
    bindExport() {
        const exportBtn = document.getElementById('exportBtn');

        exportBtn.addEventListener('click', async () => {
            // 单图拆分模式 - 切割模式下打包下载
            if (this.currentMode === 'split' && this.splitSubMode === 'cut') {
                await this.downloadSplitImagesAsZip();
                return;
            }

            // 其他情况 - 导出 Sprite Sheet
            const format = document.querySelector('input[name="format"]:checked').value;
            const prefix = document.getElementById('fileNamePrefix')?.value || '';
            const suffix = document.getElementById('fileNameSuffix')?.value || '';

            this.showLoading('正在导出...');

            try {
                await SpriteSheet.download('sprite-sheet', format, prefix, suffix);
                this.showToast('导出成功！', 'success');
            } catch (error) {
                this.showToast('导出失败: ' + error.message, 'error');
            } finally {
                this.hideLoading();
            }
        });
    },

    /**
     * 更新导出按钮显示
     */
    updateExportButtonDisplay() {
        const exportBtn = document.getElementById('exportBtn');
        if (!exportBtn) return;

        if (this.currentMode === 'split' && this.splitSubMode === 'cut') {
            // 切割模式 - 显示打包下载
            exportBtn.innerHTML = `
                <svg class="btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span>打包zip下载</span>
            `;
        } else {
            // 其他情况 - 显示导出 Sprite Sheet
            exportBtn.innerHTML = `
                <svg class="btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <span>导出 Sprite Sheet</span>
            `;
        }
    },

    /**
     * 下载单张拆分图片
     */
    async downloadSingleSplitImage(originalIndex) {
        const item = SpriteSheet.splitImages[originalIndex];
        if (!item || !item.canvas) {
            this.showToast('图片不存在', 'error');
            return;
        }

        const format = document.querySelector('input[name="format"]:checked')?.value || 'png';
        const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
        const prefix = document.getElementById('fileNamePrefix')?.value || '';

        try {
            const blob = await new Promise(resolve => {
                item.canvas.toBlob(resolve, mimeType, 0.92);
            });

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;

            // 使用 splitOrder 找到当前图片的新索引
            const newIndex = SpriteSheet.splitOrder.indexOf(originalIndex);
            const indexStr = String(newIndex + 1).padStart(3, '0');
            link.download = `${prefix}${indexStr}.${format}`;

            link.click();
            URL.revokeObjectURL(url);

            this.showToast('下载成功', 'success');
        } catch (error) {
            console.error('下载失败:', error);
            this.showToast('下载失败', 'error');
        }
    },

    /**
     * 打包下载拆分图片
     */
    async downloadSplitImagesAsZip() {
        if (SpriteSheet.splitImages.length === 0) {
            this.showToast('没有可导出的图片', 'error');
            return;
        }

        this.showLoading('正在打包...');

        try {
            const zip = new JSZip();
            const format = document.querySelector('input[name="format"]:checked').value;
            const prefix = document.getElementById('fileNamePrefix')?.value || '';
            const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';

            // 按 splitOrder 顺序导出
            const total = SpriteSheet.splitOrder.length;

            for (let i = 0; i < total; i++) {
                const originalIndex = SpriteSheet.splitOrder[i];
                const item = SpriteSheet.splitImages[originalIndex];
                if (!item || !item.canvas) continue;

                // 获取 Blob
                const blob = await new Promise(resolve => {
                    item.canvas.toBlob(resolve, mimeType, 0.92);
                });

                // 生成文件名
                const indexStr = String(i + 1).padStart(3, '0');
                const filename = `${prefix}${indexStr}.${format}`;

                // 添加到 ZIP
                zip.file(filename, blob);
            }

            // 生成 ZIP
            const zipBlob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });

            // 触发下载
            const url = URL.createObjectURL(zipBlob);
            const link = document.createElement('a');
            link.href = url;
            const timestamp = new Date().toISOString().slice(0, 10);
            link.download = `split-images_${timestamp}.zip`;
            link.click();
            URL.revokeObjectURL(url);

            this.showToast(`打包成功，共 ${total} 张图片`, 'success');
        } catch (error) {
            this.showToast('打包失败: ' + error.message, 'error');
        } finally {
            this.hideLoading();
        }
    },

    /**
     * 更新导出按钮状态
     */
    updateExportButton() {
        const exportBtn = document.getElementById('exportBtn');

        if (this.currentMode === 'multi') {
            exportBtn.disabled = SpriteSheet.images.length === 0;
        } else {
            exportBtn.disabled = SpriteSheet.splitOrder.length === 0;
        }
    },

    /**
     * 显示加载状态
     */
    showLoading(text = '处理中...') {
        document.getElementById('loadingText').textContent = text;
        document.getElementById('loadingOverlay').style.display = 'flex';
    },

    /**
     * 隐藏加载状态
     */
    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    },

    /**
     * 显示提示
     */
    showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `
            <span class="toast__icon">${type === 'success' ? '✓' : '✕'}</span>
            <span class="toast__message">${message}</span>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};
