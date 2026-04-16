/**
 * Magic Pixel - BG Remover应用主入口
 *
 * 整合所有模块，实现UI交互逻辑
 */

(function() {
    'use strict';

    // ===== DOM元素缓存 =====
    const DOM = {
        // 上传区域
        uploadZone: document.getElementById('uploadZone'),
        fileInput: document.getElementById('fileInput'),

        // 模式相关
        removalModeSection: document.getElementById('removalModeSection'),
        modeNavBtns: document.querySelectorAll('.mode-nav__btn[data-mode]'),

        // 自动抠图设置
        autoSettings: document.getElementById('autoSettings'),
        targetColorPreview: document.getElementById('targetColorPreview'),
        pickColorBtn: document.getElementById('pickColorBtn'),
        autoDetectColorBtn: document.getElementById('autoDetectColorBtn'),
        toleranceSlider: document.getElementById('toleranceSlider'),
        toleranceValue: document.getElementById('toleranceValue'),
        featherSlider: document.getElementById('featherSlider'),
        featherValue: document.getElementById('featherValue'),
        applyRemovalBtn: document.getElementById('applyRemovalBtn'),

        // 手动画笔工具
        manualTools: document.getElementById('manualTools'),
        brushModeBtns: document.querySelectorAll('.brush-mode-btn[data-brush]'),
        brushSizeSlider: document.getElementById('brushSizeSlider'),
        brushSizeValue: document.getElementById('brushSizeValue'),
        undoBrushBtn: document.getElementById('undoBrushBtn'),
        redoBrushBtn: document.getElementById('redoBrushBtn'),

        // 底色填充
        fillSettings: document.getElementById('fillSettings'),
        fillColorInput: document.getElementById('fillColorInput'),
        fillColorText: document.getElementById('fillColorText'),
        transparentBgBtn: document.getElementById('transparentBgBtn'),
        presetColors: document.querySelectorAll('.preset-color[data-color]'),

        // 导出
        exportSection: document.getElementById('exportSection'),
        downloadCurrentBtn: document.getElementById('downloadCurrentBtn'),
        downloadAllBtn: document.getElementById('downloadAllBtn'),

        // 预览区域
        previewContainer: document.getElementById('previewContainer'),
        previewPlaceholder: document.getElementById('previewPlaceholder'),
        previewWrapper: document.getElementById('previewWrapper'),
        previewCanvas: document.getElementById('previewCanvas'),
        overlayCanvas: document.getElementById('overlayCanvas'),
        imageSizeTag: document.getElementById('imageSizeTag'),
        previewZoomSlider: document.getElementById('previewZoomSlider'),
        previewZoomValue: document.getElementById('previewZoomValue'),
        resetBtn: document.getElementById('resetBtn'),

        // 缩略图
        thumbnailBar: document.getElementById('thumbnailBar'),
        thumbnailList: document.getElementById('thumbnailList'),
        addMoreBtn: document.getElementById('addMoreBtn'),

        // 加载和提示
        loadingOverlay: document.getElementById('loadingOverlay'),
        loadingText: document.getElementById('loadingText'),
        progressBar: document.getElementById('progressBar'),
        progressFill: document.getElementById('progressFill'),
        progressText: document.getElementById('progressText'),
        toastContainer: document.getElementById('toastContainer'),

        // 取色器放大镜
        magnifier: document.getElementById('colorPickerMagnifier'),
        magnifierCanvas: document.getElementById('magnifierCanvas')
    };

    // ===== 应用状态 =====
    const AppState = {
        currentMode: 'auto',      // 'auto' | 'manual'
        brushMode: 'erase',       // 'erase' | 'restore'
        isPickingColor: false,
        zoomLevel: 100,
        targetColor: null,
        fillColor: null           // null = 透明
    };

    // ===== 初始化 =====
    function init() {
        bindEvents();
        initBatchProcessor();
        initBrushTool();
    }

    // ===== 事件绑定 =====
    function bindEvents() {
        // 上传区域
        DOM.uploadZone.addEventListener('click', () => DOM.fileInput.click());
        DOM.uploadZone.addEventListener('dragover', handleDragOver);
        DOM.uploadZone.addEventListener('dragleave', handleDragLeave);
        DOM.uploadZone.addEventListener('drop', handleDrop);
        DOM.fileInput.addEventListener('change', handleFileSelect);
        DOM.addMoreBtn.addEventListener('click', () => DOM.fileInput.click());

        // 模式切换
        DOM.modeNavBtns.forEach(btn => {
            btn.addEventListener('click', () => switchMode(btn.dataset.mode));
        });

        // 画笔模式切换
        DOM.brushModeBtns.forEach(btn => {
            btn.addEventListener('click', () => switchBrushMode(btn.dataset.brush));
        });

        // 自动抠图设置
        DOM.pickColorBtn.addEventListener('click', startColorPick);
        DOM.autoDetectColorBtn.addEventListener('click', autoDetectColor);
        DOM.toleranceSlider.addEventListener('input', updateTolerance);
        DOM.featherSlider.addEventListener('input', updateFeather);
        DOM.applyRemovalBtn.addEventListener('click', applyRemoval);

        // 画笔设置
        DOM.brushSizeSlider.addEventListener('input', updateBrushSize);
        DOM.undoBrushBtn.addEventListener('click', () => BrushTool.undo());
        DOM.redoBrushBtn.addEventListener('click', () => BrushTool.redo());

        // 底色填充
        DOM.fillColorInput.addEventListener('input', handleFillColorChange);
        DOM.fillColorText.addEventListener('change', handleFillTextChange);
        DOM.transparentBgBtn.addEventListener('click', setTransparentBg);
        DOM.presetColors.forEach(btn => {
            btn.addEventListener('click', () => setPresetColor(btn.dataset.color));
        });

        // 导出
        DOM.downloadCurrentBtn.addEventListener('click', downloadCurrent);
        DOM.downloadAllBtn.addEventListener('click', downloadAll);

        // 重试按钮
        DOM.resetBtn.addEventListener('click', resetCurrentItem);

        // 缩放
        DOM.previewZoomSlider.addEventListener('input', handleZoom);

        // 预览Canvas事件（用于取色）
        DOM.previewCanvas.addEventListener('click', handlePreviewClick);
        DOM.previewCanvas.addEventListener('mousemove', handlePreviewMouseMove);
    }

    // ===== 文件处理 =====
    function handleDragOver(e) {
        e.preventDefault();
        DOM.uploadZone.classList.add('upload-zone--active');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        DOM.uploadZone.classList.remove('upload-zone--active');
    }

    function handleDrop(e) {
        e.preventDefault();
        DOM.uploadZone.classList.remove('upload-zone--active');

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFiles(files);
        }
    }

    function handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            handleFiles(files);
        }
        e.target.value = ''; // 重置以允许重复选择同一文件
    }

    async function handleFiles(files) {
        showLoading('正在导入图片...');

        try {
            await BatchProcessor.addImages(files, (percent) => {
                updateProgress(percent);
            });

            hideLoading();
            showToast(`成功导入 ${files.length} 张图片`, 'success');

            // 显示控制面板
            showControlPanels();

        } catch (error) {
            hideLoading();
            showToast('导入图片失败: ' + error.message, 'error');
        }
    }

    // ===== 批量处理器初始化 =====
    function initBatchProcessor() {
        // 添加图片时
        BatchProcessor.on('itemAdd', addItemThumbnail);

        // 移除图片时
        BatchProcessor.on('itemRemove', removeItemThumbnail);

        // 选择图片时
        BatchProcessor.on('itemSelect', loadItemToPreview);

        // 处理完成时
        BatchProcessor.on('itemProcess', onItemProcessed);

        // 更新时
        BatchProcessor.on('itemUpdate', onItemUpdated);
    }

    // ===== 缩略图管理 =====
    function addItemThumbnail(item) {
        const thumb = document.createElement('div');
        thumb.className = 'thumbnail-item';
        thumb.dataset.itemId = item.id;

        // 创建缩略图Canvas
        const thumbCanvas = document.createElement('canvas');
        const scale = Math.min(60 / item.width, 60 / item.height);
        thumbCanvas.width = item.width * scale;
        thumbCanvas.height = item.height * scale;

        const ctx = thumbCanvas.getContext('2d');
        ctx.drawImage(item.originalCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

        thumb.appendChild(thumbCanvas);

        // 状态指示器
        const status = document.createElement('div');
        status.className = 'thumbnail-item__status';
        thumb.appendChild(status);

        // 删除按钮
        const removeBtn = document.createElement('button');
        removeBtn.className = 'thumbnail-item__remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            BatchProcessor.removeItem(item.id);
        });
        thumb.appendChild(removeBtn);

        // 点击选择
        thumb.addEventListener('click', () => {
            BatchProcessor.selectItemById(item.id);
        });

        DOM.thumbnailList.appendChild(thumb);
    }

    function removeItemThumbnail(item) {
        const thumb = DOM.thumbnailList.querySelector(`[data-item-id="${item.id}"]`);
        if (thumb) {
            thumb.remove();
        }

        // 如果没有图片了，隐藏控制面板
        if (BatchProcessor.getItems().length === 0) {
            hideControlPanels();
        }
    }

    function updateThumbnailStatus(item) {
        const thumb = DOM.thumbnailList.querySelector(`[data-item-id="${item.id}"]`);
        if (!thumb) return;

        thumb.classList.toggle('thumbnail-item--active',
            BatchProcessor.getCurrentItem()?.id === item.id);
        thumb.classList.toggle('thumbnail-item--processed',
            item.status === 'processed');

        // 更新缩略图显示
        if (item.processedCanvas) {
            const thumbCanvas = thumb.querySelector('canvas');
            const scale = Math.min(60 / item.width, 60 / item.height);
            thumbCanvas.width = item.width * scale;
            thumbCanvas.height = item.height * scale;

            const ctx = thumbCanvas.getContext('2d');

            // 绘制棋盘格背景
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);

            ctx.drawImage(item.processedCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        }
    }

    // ===== 预览区域 =====
    function loadItemToPreview(item) {
        if (!item) return;

        // 更新缩略图状态
        const items = BatchProcessor.getItems();
        items.forEach(i => updateThumbnailStatus(i));

        // 设置Canvas尺寸
        DOM.previewCanvas.width = item.width;
        DOM.previewCanvas.height = item.height;
        DOM.overlayCanvas.width = item.width;
        DOM.overlayCanvas.height = item.height;

        // 绘制图像
        const ctx = DOM.previewCanvas.getContext('2d');
        ctx.clearRect(0, 0, item.width, item.height);

        if (item.processedCanvas) {
            ctx.drawImage(item.processedCanvas, 0, 0);
        } else {
            ctx.drawImage(item.originalCanvas, 0, 0);
        }

        // 更新尺寸标签
        DOM.imageSizeTag.textContent = `${item.width} × ${item.height}`;

        // 显示预览区域
        DOM.previewPlaceholder.style.display = 'none';
        DOM.previewWrapper.style.display = 'block';

        // 重置缩放
        AppState.zoomLevel = 100;
        DOM.previewZoomSlider.value = 100;
        DOM.previewZoomValue.textContent = '100%';
        applyZoom();

        // 更新按钮状态
        updateButtonStates();

        // 初始化画笔工具
        if (!BrushTool._maskCanvas ||
            BrushTool._maskCanvas.width !== item.width ||
            BrushTool._maskCanvas.height !== item.height) {
            BrushTool.clear();
            BrushTool.init(DOM.previewCanvas, item.maskCanvas, item.originalCanvas);
        } else {
            BrushTool.setOriginal(item.originalCanvas);
            BrushTool.setMask(item.maskCanvas);
        }
    }

    function onItemProcessed(item) {
        updateThumbnailStatus(item);
        loadItemToPreview(item);
        updateButtonStates();
    }

    function onItemUpdated(item) {
        const currentItem = BatchProcessor.getCurrentItem();
        if (currentItem && currentItem.id === item.id) {
            loadItemToPreview(item);
        }
        updateThumbnailStatus(item);
    }

    // ===== 模式切换 =====
    function switchMode(mode) {
        AppState.currentMode = mode;

        // 更新按钮状态
        DOM.modeNavBtns.forEach(btn => {
            btn.classList.toggle('mode-nav__btn--active', btn.dataset.mode === mode);
        });

        // 更新面板显示
        DOM.autoSettings.style.display = mode === 'auto' ? 'block' : 'none';
        DOM.manualTools.style.display = mode === 'manual' ? 'block' : 'none';

        // 切换到手动模式时，设置画笔光标
        if (mode === 'manual') {
            DOM.previewWrapper.classList.add('brush-mode');
        } else {
            DOM.previewWrapper.classList.remove('brush-mode');
        }
    }

    function switchBrushMode(mode) {
        AppState.brushMode = mode;

        DOM.brushModeBtns.forEach(btn => {
            btn.classList.toggle('brush-mode-btn--active', btn.dataset.brush === mode);
        });

        BrushTool.setMode(mode);
    }

    // ===== 颜色拾取 =====
    function startColorPick() {
        AppState.isPickingColor = true;
        BrushTool.setColorPicking(true);
        DOM.previewWrapper.classList.add('brush-mode');
        DOM.previewCanvas.style.cursor = 'crosshair';
        showToast('点击图片选择要移除的颜色', 'info');
    }

    function handlePreviewClick(e) {
        if (!AppState.isPickingColor) return;

        const item = BatchProcessor.getCurrentItem();
        if (!item || !item.originalCanvas) return;

        const rect = DOM.previewCanvas.getBoundingClientRect();
        const scale = AppState.zoomLevel / 100;
        const x = Math.floor((e.clientX - rect.left) / scale);
        const y = Math.floor((e.clientY - rect.top) / scale);

        // 从原始图像取色，而不是从预览Canvas
        const ctx = item.originalCanvas.getContext('2d');
        const pixel = ctx.getImageData(x, y, 1, 1).data;

        const color = { r: pixel[0], g: pixel[1], b: pixel[2] };
        setTargetColor(color);

        AppState.isPickingColor = false;
        BrushTool.setColorPicking(false);
        DOM.previewCanvas.style.cursor = 'default';

        if (AppState.currentMode === 'manual') {
            DOM.previewWrapper.classList.add('brush-mode');
        } else {
            DOM.previewWrapper.classList.remove('brush-mode');
        }

        showToast(`已选取颜色: ${ColorUtils.rgbToHex(color)}`, 'success');
    }

    function handlePreviewMouseMove(e) {
        // 可选：显示放大镜
    }

    function setTargetColor(color) {
        AppState.targetColor = color;
        DOM.targetColorPreview.style.background = ColorUtils.rgbToHex(color);
    }

    function autoDetectColor() {
        const item = BatchProcessor.getCurrentItem();
        if (!item) return;

        const color = BackgroundRemover.detectBackgroundColor(item.originalCanvas, 'corners');
        setTargetColor(color);
        showToast('已检测到背景颜色', 'success');
    }

    // ===== 设置更新 =====
    function updateTolerance() {
        const value = parseInt(DOM.toleranceSlider.value);
        DOM.toleranceValue.textContent = value;
        BatchProcessor.setGlobalConfig({ tolerance: value });
    }

    function updateFeather() {
        const value = parseInt(DOM.featherSlider.value);
        DOM.featherValue.textContent = value;
        BatchProcessor.setGlobalConfig({ edgeFeather: value });
    }

    function updateBrushSize() {
        const value = parseInt(DOM.brushSizeSlider.value);
        DOM.brushSizeValue.textContent = value;
        BrushTool.setConfig({ size: value });
    }

    // ===== 抠图应用 =====
    async function applyRemoval() {
        if (!AppState.targetColor) {
            showToast('请先选择要移除的颜色', 'warning');
            return;
        }

        const item = BatchProcessor.getCurrentItem();
        if (!item) return;

        showLoading('正在处理...');

        try {
            BackgroundRemover.init(item.originalCanvas);
            BackgroundRemover.setTargetColor(AppState.targetColor);
            BackgroundRemover.setConfig({
                tolerance: parseInt(DOM.toleranceSlider.value),
                edgeFeather: parseInt(DOM.featherSlider.value)
            });

            const resultCanvas = BackgroundRemover.removeBackground();
            item.processedCanvas = resultCanvas;
            item.maskCanvas = BackgroundRemover.getMask();
            item.status = 'processed';

            // 应用填充颜色
            if (AppState.fillColor) {
                item.processedCanvas = ColorFiller.fillBackground(resultCanvas, AppState.fillColor);
            }

            loadItemToPreview(item);
            updateThumbnailStatus(item);
            updateButtonStates();

            hideLoading();
            showToast('抠图完成', 'success');

        } catch (error) {
            hideLoading();
            showToast('抠图失败: ' + error.message, 'error');
        }
    }

    // ===== 底色填充 =====
    function handleFillColorChange() {
        const color = DOM.fillColorInput.value;
        DOM.fillColorText.value = color.toUpperCase();
        applyFillColor(color);
    }

    function handleFillTextChange() {
        let value = DOM.fillColorText.value;
        if (!value.startsWith('#')) {
            value = '#' + value;
        }
        if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            DOM.fillColorInput.value = value;
            applyFillColor(value);
        }
    }

    function setTransparentBg() {
        AppState.fillColor = null;
        DOM.fillColorText.value = '透明';
        DOM.fillColorInput.value = '#ffffff';

        const item = BatchProcessor.getCurrentItem();
        if (item && item.processedCanvas) {
            BatchProcessor.applyFillColor(item.id, null);
        }
    }

    function setPresetColor(color) {
        DOM.fillColorInput.value = color;
        DOM.fillColorText.value = color.toUpperCase();
        applyFillColor(color);
    }

    function applyFillColor(color) {
        AppState.fillColor = color;
        BatchProcessor.setGlobalConfig({ backgroundColor: color });

        const item = BatchProcessor.getCurrentItem();
        if (item && item.processedCanvas) {
            BatchProcessor.applyFillColor(item.id, color);
        }
    }

    // ===== 重试功能 =====
    function resetCurrentItem() {
        const item = BatchProcessor.getCurrentItem();
        if (!item) return;

        // 重置状态
        item.status = 'pending';
        item.processedCanvas = null;
        item.backgroundColor = null;
        item.fillColor = null;

        // 重置蒙版为全白（完全不透明）
        const maskCtx = item.maskCanvas.getContext('2d');
        maskCtx.fillStyle = 'white';
        maskCtx.fillRect(0, 0, item.maskCanvas.width, item.maskCanvas.height);

        // 重置目标颜色
        AppState.targetColor = null;
        DOM.targetColorPreview.style.background = '#ffffff';

        // 重置画笔历史
        BrushTool.clear();

        // 重新加载预览
        loadItemToPreview(item);
        updateThumbnailStatus(item);
        updateButtonStates();

        // 隐藏重试按钮
        DOM.resetBtn.style.display = 'none';

        showToast('已重置为原始图像', 'success');
    }

    // ===== 缩放 =====
    function handleZoom() {
        AppState.zoomLevel = parseInt(DOM.previewZoomSlider.value);
        DOM.previewZoomValue.textContent = AppState.zoomLevel + '%';
        applyZoom();
    }

    function applyZoom() {
        DOM.previewWrapper.style.transform = `scale(${AppState.zoomLevel / 100})`;
    }

    // ===== 导出 =====
    async function downloadCurrent() {
        const item = BatchProcessor.getCurrentItem();
        if (!item || !item.processedCanvas) {
            showToast('没有可导出的图片', 'warning');
            return;
        }

        try {
            await BatchProcessor.exportItem(item.id);
            showToast('下载完成', 'success');
        } catch (error) {
            showToast('导出失败: ' + error.message, 'error');
        }
    }

    async function downloadAll() {
        const stats = BatchProcessor.getStats();
        if (stats.processed === 0) {
            showToast('没有已处理的图片可导出', 'warning');
            return;
        }

        showLoading('正在打包导出...');

        try {
            await BatchProcessor.exportAll((progress) => {
                updateProgress(progress.percent);
            });

            hideLoading();
            showToast('批量导出完成', 'success');

        } catch (error) {
            hideLoading();
            showToast('导出失败: ' + error.message, 'error');
        }
    }

    // ===== UI辅助函数 =====
    function showControlPanels() {
        DOM.removalModeSection.style.display = 'block';
        DOM.autoSettings.style.display = AppState.currentMode === 'auto' ? 'block' : 'none';
        DOM.manualTools.style.display = AppState.currentMode === 'manual' ? 'block' : 'none';
        DOM.fillSettings.style.display = 'block';
        DOM.exportSection.style.display = 'block';
        DOM.thumbnailBar.style.display = 'flex';
    }

    function hideControlPanels() {
        DOM.removalModeSection.style.display = 'none';
        DOM.autoSettings.style.display = 'none';
        DOM.manualTools.style.display = 'none';
        DOM.fillSettings.style.display = 'none';
        DOM.exportSection.style.display = 'none';
        DOM.previewPlaceholder.style.display = 'flex';
        DOM.previewWrapper.style.display = 'none';
    }

    function updateButtonStates() {
        const item = BatchProcessor.getCurrentItem();
        const hasProcessed = item && item.processedCanvas;

        DOM.downloadCurrentBtn.disabled = !hasProcessed;
        DOM.downloadAllBtn.disabled = BatchProcessor.getStats().processed === 0;
        DOM.undoBrushBtn.disabled = !BrushTool.canUndo();
        DOM.redoBrushBtn.disabled = !BrushTool.canRedo();

        // 重试按钮：只有在有已处理的图片时才显示
        DOM.resetBtn.style.display = hasProcessed ? 'inline-flex' : 'none';
    }

    function showLoading(text) {
        DOM.loadingText.textContent = text || '处理中...';
        DOM.loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        DOM.loadingOverlay.style.display = 'none';
    }

    function updateProgress(percent) {
        DOM.progressFill.style.width = percent + '%';
        DOM.progressText.textContent = percent + '%';
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.textContent = message;

        DOM.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast--fade-out');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ===== 画笔工具初始化 =====
    function initBrushTool() {
        BrushTool.on('maskChange', (maskCanvas) => {
            const item = BatchProcessor.getCurrentItem();
            if (item) {
                BatchProcessor.updateItemMask(item.id, maskCanvas);
            }
        });

        BrushTool.on('brushEnd', () => {
            updateButtonStates();
        });
    }

    // ===== 启动应用 =====
    document.addEventListener('DOMContentLoaded', init);

})();
