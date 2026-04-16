/**
 * Magic Pixel - BG Remover模块
 *
 * 基于颜色差异的自动抠图功能
 */

const BackgroundRemover = {
    // 配置
    _config: {
        tolerance: 30,           // 颜色容差 (0-100)
        edgeFeather: 2,         // 边缘羽化半径
        colorDistanceMethod: 'perceptual', // 'perceptual' | 'euclidean'
    },

    // 状态
    _sourceCanvas: null,
    _maskCanvas: null,      // 蒙版Canvas (存储alpha通道)
    _targetColor: null,     // 目标背景色 { r, g, b }

    /**
     * 初始化抠图
     * @param {HTMLCanvasElement} sourceCanvas - 源图像Canvas
     * @returns {Object} 包含maskCanvas的结果
     */
    init(sourceCanvas) {
        this._sourceCanvas = sourceCanvas;

        // 创建蒙版Canvas (单通道灰度图)
        this._maskCanvas = CanvasUtils.createCanvas(
            sourceCanvas.width,
            sourceCanvas.height
        );

        // 初始化蒙版为完全不透明
        const ctx = this._maskCanvas.getContext('2d');
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, sourceCanvas.width, sourceCanvas.height);

        return {
            maskCanvas: this._maskCanvas
        };
    },

    /**
     * 设置目标背景色
     * @param {Object} color - { r, g, b }
     */
    setTargetColor(color) {
        this._targetColor = color;
    },

    /**
     * 设置配置
     * @param {Object} config - 配置参数
     */
    setConfig(config) {
        Object.assign(this._config, config);
    },

    /**
     * 执行自动抠图
     * @param {Object} options - 可选参数
     * @returns {HTMLCanvasElement} 结果Canvas
     */
    removeBackground(options = {}) {
        const { tolerance, edgeFeather, colorDistanceMethod } = this._config;

        if (!this._sourceCanvas) {
            throw new Error('请先初始化');
        }

        if (!this._targetColor) {
            throw new Error('请先设置目标背景色');
        }

        const width = this._sourceCanvas.width;
        const height = this._sourceCanvas.height;

        // 获取源图像数据
        const sourceCtx = this._sourceCanvas.getContext('2d');
        const sourceData = sourceCtx.getImageData(0, 0, width, height);

        // 创建结果图像数据
        const resultData = new ImageData(width, height);

        // 获取距离计算函数
        const distanceFunc = colorDistanceMethod === 'perceptual'
            ? ColorUtils.perceptualDistance.bind(ColorUtils)
            : ColorUtils.euclideanDistance.bind(ColorUtils);

        // 计算阈值（基于容差）
        // 感知距离最大约100，欧几里得距离最大约441
        const maxDistance = colorDistanceMethod === 'perceptual' ? 100 : 441;
        // 扩大阈值范围，使抠图更彻底
        const threshold = (tolerance / 100) * maxDistance * 1.5;

        // 遍历每个像素
        for (let i = 0; i < sourceData.data.length; i += 4) {
            const r = sourceData.data[i];
            const g = sourceData.data[i + 1];
            const b = sourceData.data[i + 2];
            const a = sourceData.data[i + 3];

            // 计算与目标色的距离
            const distance = distanceFunc(
                { r, g, b },
                this._targetColor
            );

            // 计算透明度 (基于容差)
            let alpha;

            if (distance <= threshold * 0.7) {
                // 在容差范围内，完全透明
                alpha = 0;
            } else if (distance <= threshold) {
                // 边缘过渡区域，根据距离计算透明度
                const ratio = (distance - threshold * 0.7) / (threshold * 0.3);
                alpha = Math.round(ratio * 255);
            } else {
                // 超出容差，完全不透明
                alpha = 255;
            }

            // 应用边缘羽化
            if (edgeFeather > 0 && alpha > 0 && alpha < 255) {
                alpha = this._applyFeather(alpha, edgeFeather);
            }

            // 写入结果
            resultData.data[i] = r;
            resultData.data[i + 1] = g;
            resultData.data[i + 2] = b;
            resultData.data[i + 3] = Math.round(alpha * (a / 255));
        }

        // 创建结果Canvas
        const resultCanvas = CanvasUtils.createCanvas(width, height);
        const resultCtx = resultCanvas.getContext('2d');
        resultCtx.putImageData(resultData, 0, 0);

        // 保存蒙版
        this._saveMask(resultData);

        return resultCanvas;
    },

    /**
     * 应用边缘羽化
     * @param {number} alpha - 原始透明度
     * @param {number} radius - 羽化半径
     * @returns {number} 羽化后的透明度
     */
    _applyFeather(alpha, radius) {
        // 使用正弦函数平滑过渡
        const t = alpha / 255;
        const smoothed = Math.sin(t * Math.PI / 2);
        return Math.round(smoothed * 255);
    },

    /**
     * 保存蒙版数据
     */
    _saveMask(imageData) {
        const maskCtx = this._maskCanvas.getContext('2d');
        const maskData = maskCtx.createImageData(
            this._maskCanvas.width,
            this._maskCanvas.height
        );

        // 提取alpha通道作为蒙版
        for (let i = 0; i < imageData.data.length; i += 4) {
            maskData.data[i] = imageData.data[i + 3];     // R = Alpha
            maskData.data[i + 1] = imageData.data[i + 3]; // G = Alpha
            maskData.data[i + 2] = imageData.data[i + 3]; // B = Alpha
            maskData.data[i + 3] = 255;                    // A = 255
        }

        maskCtx.putImageData(maskData, 0, 0);
    },

    /**
     * 智能检测背景色
     * @param {HTMLCanvasElement} canvas - 源Canvas
     * @param {string} method - 检测方法: 'corners' | 'edges' | 'dominant'
     * @returns {Object} { r, g, b }
     */
    detectBackgroundColor(canvas, method = 'corners') {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const sampleSize = Math.min(10, Math.floor(Math.min(width, height) / 4));

        const colors = [];

        switch (method) {
            case 'corners':
                // 从四个角采样
                colors.push(this._sampleRegion(ctx, 0, 0, sampleSize, sampleSize));
                colors.push(this._sampleRegion(ctx, width - sampleSize, 0, sampleSize, sampleSize));
                colors.push(this._sampleRegion(ctx, 0, height - sampleSize, sampleSize, sampleSize));
                colors.push(this._sampleRegion(ctx, width - sampleSize, height - sampleSize, sampleSize, sampleSize));
                break;

            case 'edges':
                // 从边缘采样
                const edgeSamples = 5;
                for (let i = 0; i < edgeSamples; i++) {
                    const x = Math.floor((width / edgeSamples) * i + width / edgeSamples / 2);
                    const y = Math.floor((height / edgeSamples) * i + height / edgeSamples / 2);

                    // 上边缘
                    colors.push(this._sampleRegion(ctx, x - sampleSize/2, 0, sampleSize, sampleSize));
                    // 下边缘
                    colors.push(this._sampleRegion(ctx, x - sampleSize/2, height - sampleSize, sampleSize, sampleSize));
                    // 左边缘
                    colors.push(this._sampleRegion(ctx, 0, y - sampleSize/2, sampleSize, sampleSize));
                    // 右边缘
                    colors.push(this._sampleRegion(ctx, width - sampleSize, y - sampleSize/2, sampleSize, sampleSize));
                }
                break;

            case 'dominant':
                // 整体主导色
                const imageData = ctx.getImageData(0, 0, width, height);
                const allColors = [];
                for (let i = 0; i < imageData.data.length; i += 4) {
                    allColors.push({
                        r: imageData.data[i],
                        g: imageData.data[i + 1],
                        b: imageData.data[i + 2]
                    });
                }
                return ColorUtils.getDominantColor(allColors, 32);
        }

        // 返回平均颜色
        return ColorUtils.getAverageColor(colors);
    },

    /**
     * 采样区域平均色
     */
    _sampleRegion(ctx, x, y, width, height) {
        // 确保坐标在有效范围内
        x = Math.max(0, Math.floor(x));
        y = Math.max(0, Math.floor(y));
        width = Math.max(1, Math.floor(width));
        height = Math.max(1, Math.floor(height));

        const imageData = ctx.getImageData(x, y, width, height);
        const colors = [];

        for (let i = 0; i < imageData.data.length; i += 4) {
            colors.push({
                r: imageData.data[i],
                g: imageData.data[i + 1],
                b: imageData.data[i + 2]
            });
        }

        return ColorUtils.getAverageColor(colors);
    },

    /**
     * 获取当前蒙版
     */
    getMask() {
        return this._maskCanvas;
    },

    /**
     * 应用外部蒙版修改（来自画笔工具）
     */
    applyMask(maskCanvas) {
        this._maskCanvas = CanvasUtils.cloneCanvas(maskCanvas);
    },

    /**
     * 从蒙版应用抠图结果
     * @param {HTMLCanvasElement} sourceCanvas - 原始图像
     * @param {HTMLCanvasElement} maskCanvas - 蒙版
     * @returns {HTMLCanvasElement} 结果Canvas
     */
    applyMaskToSource(sourceCanvas, maskCanvas) {
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;

        const sourceCtx = sourceCanvas.getContext('2d');
        const maskCtx = maskCanvas.getContext('2d');

        const sourceData = sourceCtx.getImageData(0, 0, width, height);
        const maskData = maskCtx.getImageData(0, 0, width, height);

        const resultData = new ImageData(width, height);

        for (let i = 0; i < sourceData.data.length; i += 4) {
            resultData.data[i] = sourceData.data[i];
            resultData.data[i + 1] = sourceData.data[i + 1];
            resultData.data[i + 2] = sourceData.data[i + 2];
            // 使用蒙版的红色通道作为alpha
            resultData.data[i + 3] = maskData.data[i];
        }

        const resultCanvas = CanvasUtils.createCanvas(width, height);
        const resultCtx = resultCanvas.getContext('2d');
        resultCtx.putImageData(resultData, 0, 0);

        return resultCanvas;
    },

    /**
     * 清除
     */
    clear() {
        this._sourceCanvas = null;
        this._maskCanvas = null;
        this._targetColor = null;
    }
};
