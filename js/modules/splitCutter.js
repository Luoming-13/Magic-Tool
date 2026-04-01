/**
 * SplitCutter - 单图拆分切割模块
 *
 * 复用 magic cutting 的核心逻辑，适配 Sprite Sheet 页面
 */

const SplitCutter = {
    // 状态
    _sourceImage: null,
    _cols: 4,
    _rows: 4,
    _sliderMax: 10,
    _pieces: [],
    _gridImageData: [],

    /**
     * 设置源图片
     * @param {Object} imageData - 图片数据 { img, name, width, height }
     */
    setSourceImage(imageData) {
        this._sourceImage = imageData;
        this._pieces = [];
        this._gridImageData = [];
    },

    /**
     * 获取源图片
     */
    getSourceImage() {
        return this._sourceImage;
    },

    /**
     * 设置切割网格
     * @param {number} cols - 列数
     * @param {number} rows - 行数
     */
    setGrid(cols, rows) {
        this._cols = Math.max(1, Math.min(50, parseInt(cols) || 4));
        this._rows = Math.max(1, Math.min(50, parseInt(rows) || 4));
    },

    /**
     * 设置滑块上限
     * @param {number} max - 最大值
     */
    setSliderMax(max) {
        this._sliderMax = Math.max(1, Math.min(50, parseInt(max) || 10));
    },

    /**
     * 获取滑块上限
     */
    getSliderMax() {
        return this._sliderMax;
    },

    /**
     * 获取切割块尺寸信息
     */
    getPieceSizeInfo() {
        if (!this._sourceImage) return null;

        const img = this._sourceImage.img;
        const baseWidth = Math.floor(img.width / this._cols);
        const baseHeight = Math.floor(img.height / this._rows);

        return {
            width: baseWidth,
            height: baseHeight,
            formatted: `${baseWidth} × ${baseHeight}`
        };
    },

    /**
     * 执行切割
     * @returns {Array} 切割块数组
     */
    executeSplit() {
        if (!this._sourceImage) return [];

        const { img } = this._sourceImage;
        const cellW = Math.floor(img.width / this._cols);
        const cellH = Math.floor(img.height / this._rows);

        this._pieces = [];
        this._gridImageData = [];

        for (let row = 0; row < this._rows; row++) {
            for (let col = 0; col < this._cols; col++) {
                const canvas = document.createElement('canvas');
                canvas.width = cellW;
                canvas.height = cellH;
                const ctx = canvas.getContext('2d');

                ctx.drawImage(
                    img,
                    col * cellW, row * cellH, cellW, cellH,
                    0, 0, cellW, cellH
                );

                const pieceData = {
                    canvas,
                    index: row * this._cols + col,
                    row,
                    col,
                    dataUrl: canvas.toDataURL('image/png')
                };

                this._pieces.push(pieceData);
                this._gridImageData.push(pieceData);
            }
        }

        return this._pieces;
    },

    /**
     * 获取切割结果（用于传递给多图模式）
     */
    getGridImageData() {
        return this._gridImageData;
    },

    /**
     * 获取网格设置
     */
    getGridSize() {
        return { cols: this._cols, rows: this._rows };
    },

    /**
     * 清除状态
     */
    clear() {
        this._sourceImage = null;
        this._pieces = [];
        this._gridImageData = [];
        this._cols = 4;
        this._rows = 4;
    }
};
