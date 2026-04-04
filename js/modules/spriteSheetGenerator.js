/**
 * Magic Pixel - 精灵表生成模块
 *
 * 生成标准化精灵表，支持行列配置和间距
 * 改造：支持 Block 数据结构
 */

const SpriteSheetGenerator = {
    // 配置
    _config: {
        cols: 4,              // 列数
        rows: null,           // 行数（自动计算）
        cellWidth: null,      // 单元格宽度（自动）
        cellHeight: null,     // 单元格高度（自动）
        format: 'png'         // 导出格式
    },

    // 数据（Block 或 Frame）
    _items: null,
    _maxSize: null,

    // 生成结果
    _result: null,

    /**
     * 准备生成
     * @param {Array} items - 数据数组（Block 或 Frame）
     * @param {Object} maxSize - 最大尺寸 { width, height }
     */
    prepare(items, maxSize) {
        this._items = items;
        this._maxSize = maxSize;

        if (maxSize) {
            this._config.cellWidth = maxSize.width;
            this._config.cellHeight = maxSize.height;
        }
    },

    /**
     * 生成精灵表
     * @returns {Object} 生成结果 { canvas, width, height, cols, rows, blockCount }
     */
    generate() {
        if (!this._items || !this._maxSize) {
            return null;
        }

        const items = this._items;
        const maxSize = this._maxSize;
        const { cols } = this._config;

        // 计算行列数
        const totalItems = items.length;
        const actualCols = Math.min(cols, totalItems);
        const actualRows = Math.ceil(totalItems / actualCols);

        // 计算输出尺寸（maxSize 已包含扩展距离）
        const cellW = maxSize.width;
        const cellH = maxSize.height;
        const outputWidth = actualCols * cellW;
        const outputHeight = actualRows * cellH;

        // 创建精灵表 Canvas
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, outputWidth);
        canvas.height = Math.max(1, outputHeight);
        const ctx = canvas.getContext('2d');

        // 清除透明
        ctx.clearRect(0, 0, outputWidth, outputHeight);

        // 绘制每个项
        items.forEach((item, index) => {
            if (!item.region) return;

            // 兼容 Block (sourceImage) 和 Frame (image)
            const image = item.sourceImage || item.image;
            if (!image) return;

            const col = index % actualCols;
            const row = Math.floor(index / actualCols);

            // 计算绘制位置
            const x = col * cellW + (item.pivot ? item.pivot.offsetX : 0);
            const y = row * cellH + (item.pivot ? item.pivot.offsetY : 0);

            // 使用精确绘制（如果有 pixelCoords）
            if (typeof AutoSlicer !== 'undefined' && AutoSlicer.renderRegionToCanvas) {
                AutoSlicer.renderRegionToCanvas(image, item.region, item.pixelCoords, ctx, x, y);
            } else {
                // 回退到矩形绘制
                ctx.drawImage(
                    image,
                    item.region.x, item.region.y,
                    item.region.width, item.region.height,
                    x, y,
                    item.region.width, item.region.height
                );
            }
        });

        // 存储结果
        this._result = {
            canvas: canvas,
            width: outputWidth,
            height: outputHeight,
            cols: actualCols,
            rows: actualRows,
            blockCount: totalItems,
            cellSize: maxSize
        };

        return this._result;
    },

    /**
     * 获取精灵表
     * @returns {Object|null} 精灵表结果
     */
    getSheet() {
        return this._result;
    },

    /**
     * 导出精灵表
     * @param {string} filename - 文件名
     * @param {string} format - 格式 ('png' | 'jpg')
     */
    async export(filename = 'sprite_sheet', format = null) {
        if (!this._result) {
            throw new Error('请先生成精灵表');
        }

        const exportFormat = format || this._config.format;
        const canvas = this._result.canvas;

        try {
            const blob = await CanvasUtils.canvasToBlob(canvas, exportFormat);
            FileUtils.downloadBlob(blob, `${filename}.${exportFormat}`);
            return true;
        } catch (error) {
            console.error('导出失败:', error);
            throw error;
        }
    },

    /**
     * 导出为 DataURL
     * @param {string} format - 格式 ('png' | 'jpg')
     * @returns {string} DataURL
     */
    exportToDataURL(format = 'png') {
        if (!this._result) {
            return null;
        }

        const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
        return this._result.canvas.toDataURL(mimeType, 0.95);
    },

    /**
     * 设置列数
     * @param {number} cols - 列数
     */
    setCols(cols) {
        this._config.cols = Math.max(1, parseInt(cols) || 4);
    },

    /**
     * 设置间距（已废弃，扩展距离由 FrameAligner 处理）
     * @param {number} spacing - 间距值
     * @deprecated
     */
    setSpacing(spacing) {
        // 保留空方法以向后兼容
    },

    /**
     * 设置导出格式
     * @param {string} format - 格式 ('png' | 'jpg')
     */
    setFormat(format) {
        if (['png', 'jpg'].includes(format)) {
            this._config.format = format;
        }
    },

    /**
     * 获取配置
     * @returns {Object} 配置对象
     */
    getConfig() {
        return { ...this._config };
    },

    /**
     * 获取预估输出尺寸
     * @param {number} itemCount - 项数量
     * @returns {Object} 尺寸信息 { width, height, cols, rows }
     */
    getEstimatedSize(itemCount) {
        if (!this._maxSize) {
            return null;
        }

        const { cols } = this._config;
        const actualCols = Math.min(cols, itemCount);
        const actualRows = Math.ceil(itemCount / actualCols);

        // maxSize 已包含扩展距离
        const cellW = this._maxSize.width;
        const cellH = this._maxSize.height;

        return {
            width: actualCols * cellW,
            height: actualRows * cellH,
            cols: actualCols,
            rows: actualRows
        };
    },

    /**
     * 清除
     */
    clear() {
        this._items = null;
        this._maxSize = null;
        this._result = null;
    }
};
