/**
 * Sprite Sheet - 精灵图合成核心模块
 *
 * 负责图片的合成和拆分逻辑
 */

const SpriteSheet = {
    images: [],           // 多图模式的图片数组
    splitImages: [],      // 拆分后的图片数组
    splitOrder: [],       // 拆分图片的排序
    sourceImage: null,    // 单图模式的源图片
    cols: 4,
    rows: 4,
    cellWidth: 0,
    cellHeight: 0,
    padding: 0,

    /**
     * 重置多图模式数据
     */
    resetMultiMode() {
        this.images = [];
    },

    /**
     * 重置单图拆分模式数据
     */
    resetSplitMode() {
        this.splitImages = [];
        this.splitOrder = [];
        this.sourceImage = null;
    },

    /**
     * 设置参数
     */
    setParams(params) {
        if (params.cols !== undefined) this.cols = params.cols;
        if (params.rows !== undefined) this.rows = params.rows;
        if (params.cellWidth !== undefined) this.cellWidth = params.cellWidth;
        if (params.cellHeight !== undefined) this.cellHeight = params.cellHeight;
        if (params.padding !== undefined) this.padding = params.padding;
    },

    /**
     * 添加图片到多图模式
     */
    addImages(files) {
        return new Promise((resolve) => {
            const promises = Array.from(files).map(file => {
                return new Promise((res) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => res({
                            img,
                            name: file.name,
                            width: img.width,
                            height: img.height
                        });
                        img.onerror = () => res(null);
                        img.src = e.target.result;
                    };
                    reader.onerror = () => res(null);
                    reader.readAsDataURL(file);
                });
            });

            Promise.all(promises).then(results => {
                const validImages = results.filter(r => r !== null);
                this.images = [...this.images, ...validImages];
                resolve(validImages);
            });
        });
    },

    /**
     * 移除指定索引的图片
     */
    removeImage(index) {
        this.images.splice(index, 1);
    },

    /**
     * 重新排序图片
     */
    reorderImages(fromIndex, toIndex) {
        const [removed] = this.images.splice(fromIndex, 1);
        this.images.splice(toIndex, 0, removed);
    },

    /**
     * 设置源图片（单图拆分模式）
     */
    setSourceImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    this.sourceImage = {
                        img,
                        name: file.name,
                        width: img.width,
                        height: img.height
                    };
                    resolve(this.sourceImage);
                };
                img.onerror = () => reject(new Error('图片加载失败'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(file);
        });
    },

    /**
     * 拆分源图片
     */
    splitSourceImage() {
        if (!this.sourceImage) return [];

        const { img } = this.sourceImage;
        const cellW = this.cellWidth || Math.floor(img.width / this.cols);
        const cellH = this.cellHeight || Math.floor(img.height / this.rows);

        this.splitImages = [];
        this.splitOrder = [];

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const canvas = document.createElement('canvas');
                canvas.width = cellW;
                canvas.height = cellH;
                const ctx = canvas.getContext('2d');

                ctx.drawImage(
                    img,
                    col * cellW, row * cellH, cellW, cellH,
                    0, 0, cellW, cellH
                );

                const index = row * this.cols + col;
                this.splitImages.push({
                    canvas,
                    index,
                    row,
                    col
                });
                this.splitOrder.push(index);
            }
        }

        return this.splitImages;
    },

    /**
     * 重新排序拆分图片
     */
    reorderSplitImages(fromIndex, toIndex) {
        const [removed] = this.splitOrder.splice(fromIndex, 1);
        this.splitOrder.splice(toIndex, 0, removed);
    },

    /**
     * 重新拆分并排列
     * 根据当前的行列设置重新拆分源图
     */
    reSplitAndArrange() {
        if (!this.sourceImage) return [];

        const { img } = this.sourceImage;
        const cellW = this.cellWidth || Math.floor(img.width / this.cols);
        const cellH = this.cellHeight || Math.floor(img.height / this.rows);

        this.splitImages = [];
        this.splitOrder = [];

        const totalCells = this.cols * this.rows;

        for (let i = 0; i < totalCells; i++) {
            const row = Math.floor(i / this.cols);
            const col = i % this.cols;

            const canvas = document.createElement('canvas');
            canvas.width = cellW;
            canvas.height = cellH;
            const ctx = canvas.getContext('2d');

            // 从源图对应位置裁剪
            ctx.drawImage(
                img,
                col * cellW, row * cellH, cellW, cellH,
                0, 0, cellW, cellH
            );

            this.splitImages.push({
                canvas,
                index: i,
                row,
                col
            });
            this.splitOrder.push(i);
        }

        return this.splitImages;
    },

    /**
     * 自动计算单元格尺寸
     */
    autoCalculateCellSize() {
        if (this.images.length > 0) {
            // 多图模式：取最大尺寸
            let maxWidth = 0, maxHeight = 0;
            this.images.forEach(item => {
                maxWidth = Math.max(maxWidth, item.width);
                maxHeight = Math.max(maxHeight, item.height);
            });
            this.cellWidth = maxWidth;
            this.cellHeight = maxHeight;
        } else if (this.sourceImage) {
            // 单图拆分模式：平均分割
            this.cellWidth = Math.floor(this.sourceImage.width / this.cols);
            this.cellHeight = Math.floor(this.sourceImage.height / this.rows);
        }
        return { width: this.cellWidth, height: this.cellHeight };
    },

    /**
     * 计算输出尺寸
     */
    calculateOutputSize() {
        // 多图模式
        if (this.images.length > 0) {
            const totalWidth = this.cols * this.cellWidth + (this.cols - 1) * this.padding;
            const totalHeight = this.rows * this.cellHeight + (this.rows - 1) * this.padding;
            return { width: totalWidth, height: totalHeight };
        }

        // 单图拆分模式：根据实际帧数计算
        const frameCount = this.splitOrder.length;
        if (frameCount === 0) {
            return { width: 0, height: 0 };
        }

        // 使用设置的行列数计算
        const totalWidth = this.cols * this.cellWidth + (this.cols - 1) * this.padding;
        const totalHeight = this.rows * this.cellHeight + (this.rows - 1) * this.padding;
        return { width: totalWidth, height: totalHeight };
    },

    /**
     * 合成精灵图（多图模式）
     */
    composeMultiImages() {
        const { width, height } = this.calculateOutputSize();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // 清空画布（透明背景）
        ctx.clearRect(0, 0, width, height);

        // 绘制每张图片
        this.images.forEach((item, index) => {
            const col = index % this.cols;
            const row = Math.floor(index / this.cols);
            const x = col * (this.cellWidth + this.padding);
            const y = row * (this.cellHeight + this.padding);

            // 居中绘制
            const offsetX = (this.cellWidth - item.width) / 2;
            const offsetY = (this.cellHeight - item.height) / 2;

            ctx.drawImage(item.img, x + offsetX, y + offsetY);
        });

        return canvas;
    },

    /**
     * 合成精灵图（单图拆分模式）
     */
    composeSplitImages() {
        const { width, height } = this.calculateOutputSize();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, width, height);

        // 按照排序绘制
        this.splitOrder.forEach((originalIndex, newIndex) => {
            const col = newIndex % this.cols;
            const row = Math.floor(newIndex / this.cols);
            const x = col * (this.cellWidth + this.padding);
            const y = row * (this.cellHeight + this.padding);

            const splitItem = this.splitImages[originalIndex];
            if (splitItem) {
                ctx.drawImage(splitItem.canvas, x, y);
            }
        });

        return canvas;
    },

    /**
     * 导出为 Blob
     */
    exportAsBlob(format = 'png', quality = 0.92) {
        const canvas = this.images.length > 0
            ? this.composeMultiImages()
            : this.composeSplitImages();

        return new Promise((resolve) => {
            const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
            canvas.toBlob(resolve, mimeType, quality);
        });
    },

    /**
     * 下载精灵图
     */
    async download(filename = 'sprite-sheet', format = 'png', prefix = '', suffix = '') {
        const blob = await this.exportAsBlob(format);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${prefix}${filename}${suffix}.${format}`;
        link.click();
        URL.revokeObjectURL(url);
    }
};
