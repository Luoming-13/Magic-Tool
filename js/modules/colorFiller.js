/**
 * Magic Pixel - 底色填充模块
 *
 * 为透明图片填充背景色
 */

const ColorFiller = {
    /**
     * 填充背景色
     * @param {HTMLCanvasElement} sourceCanvas - 源Canvas（带透明通道）
     * @param {Object|string} backgroundColor - 背景色 { r, g, b } 或 'transparent' 或 hex字符串
     * @returns {HTMLCanvasElement} 结果Canvas
     */
    fillBackground(sourceCanvas, backgroundColor) {
        const width = sourceCanvas.width;
        const height = sourceCanvas.height;

        // 创建结果Canvas
        const resultCanvas = CanvasUtils.createCanvas(width, height);
        const resultCtx = resultCanvas.getContext('2d');

        // 解析颜色
        let color = null;
        if (backgroundColor && backgroundColor !== 'transparent') {
            if (typeof backgroundColor === 'string') {
                // Hex字符串
                color = ColorUtils.hexToRgb(backgroundColor);
            } else if (typeof backgroundColor === 'object') {
                color = backgroundColor;
            }

            // 先绘制背景色
            const hexColor = ColorUtils.rgbToHex(color);
            resultCtx.fillStyle = hexColor;
            resultCtx.fillRect(0, 0, width, height);
        }

        // 绘制原图（保持透明通道）
        resultCtx.drawImage(sourceCanvas, 0, 0);

        return resultCanvas;
    },

    /**
     * 移除背景色（恢复透明）
     * @param {HTMLCanvasElement} canvas - 源Canvas
     * @returns {HTMLCanvasElement} 结果Canvas
     */
    removeBackground(canvas) {
        const width = canvas.width;
        const height = canvas.height;

        const resultCanvas = CanvasUtils.createCanvas(width, height);
        const resultCtx = resultCanvas.getContext('2d');
        resultCtx.drawImage(canvas, 0, 0);

        return resultCanvas;
    },

    /**
     * 替换背景色（不添加新背景）
     * @param {HTMLCanvasElement} canvas - 源Canvas
     * @param {Object} oldColor - 旧颜色 { r, g, b }
     * @param {Object} newColor - 新颜色 { r, g, b }
     * @param {number} tolerance - 容差
     * @returns {HTMLCanvasElement} 结果Canvas
     */
    replaceColor(canvas, oldColor, newColor, tolerance = 30) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const imageData = ctx.getImageData(0, 0, width, height);

        const maxDistance = tolerance * 2.55; // 转换为0-255范围

        for (let i = 0; i < imageData.data.length; i += 4) {
            const r = imageData.data[i];
            const g = imageData.data[i + 1];
            const b = imageData.data[i + 2];

            const distance = ColorUtils.euclideanDistance(
                { r, g, b },
                oldColor
            );

            if (distance <= maxDistance) {
                imageData.data[i] = newColor.r;
                imageData.data[i + 1] = newColor.g;
                imageData.data[i + 2] = newColor.b;
            }
        }

        const resultCanvas = CanvasUtils.createCanvas(width, height);
        const resultCtx = resultCanvas.getContext('2d');
        resultCtx.putImageData(imageData, 0, 0);

        return resultCanvas;
    },

    /**
     * 创建纯色背景Canvas
     * @param {number} width - 宽度
     * @param {number} height - 高度
     * @param {Object|string} color - 颜色 { r, g, b } 或 hex字符串
     * @returns {HTMLCanvasElement} Canvas
     */
    createSolidBackground(width, height, color) {
        const canvas = CanvasUtils.createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        let hexColor;
        if (typeof color === 'string') {
            hexColor = color.startsWith('#') ? color : '#' + color;
        } else {
            hexColor = ColorUtils.rgbToHex(color);
        }

        ctx.fillStyle = hexColor;
        ctx.fillRect(0, 0, width, height);

        return canvas;
    },

    /**
     * 创建渐变背景Canvas
     * @param {number} width - 宽度
     * @param {number} height - 高度
     * @param {Object} options - 渐变选项
     * @returns {HTMLCanvasElement} Canvas
     */
    createGradientBackground(width, height, options) {
        const {
            type = 'linear', // 'linear' | 'radial'
            colors = ['#ffffff', '#000000'],
            angle = 0,       // 线性渐变角度（度）
            center = { x: 0.5, y: 0.5 } // 径向渐变中心
        } = options;

        const canvas = CanvasUtils.createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        let gradient;

        if (type === 'linear') {
            // 计算渐变起点和终点
            const rad = (angle - 90) * Math.PI / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);
            const len = Math.max(width, height);

            const x1 = width / 2 - cos * len / 2;
            const y1 = height / 2 - sin * len / 2;
            const x2 = width / 2 + cos * len / 2;
            const y2 = height / 2 + sin * len / 2;

            gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        } else {
            // 径向渐变
            const cx = width * center.x;
            const cy = height * center.y;
            const radius = Math.max(width, height) / 2;

            gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        }

        // 添加颜色停靠点
        const step = 1 / (colors.length - 1);
        colors.forEach((color, index) => {
            gradient.addColorStop(index * step, color);
        });

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        return canvas;
    },

    /**
     * 检查Canvas是否有透明像素
     * @param {HTMLCanvasElement} canvas - Canvas
     * @returns {boolean} 是否有透明像素
     */
    hasTransparency(canvas) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        for (let i = 3; i < imageData.data.length; i += 4) {
            if (imageData.data[i] < 255) {
                return true;
            }
        }

        return false;
    },

    /**
     * 获取Canvas的主色调
     * @param {HTMLCanvasElement} canvas - Canvas
     * @param {number} sampleSize - 采样数量
     * @returns {Object} 主色调 { r, g, b }
     */
    getDominantColor(canvas, sampleSize = 1000) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const imageData = ctx.getImageData(0, 0, width, height);

        const colors = [];
        const step = Math.max(1, Math.floor((width * height) / sampleSize));

        for (let i = 0; i < imageData.data.length; i += 4 * step) {
            // 跳过透明像素
            if (imageData.data[i + 3] < 128) continue;

            colors.push({
                r: imageData.data[i],
                g: imageData.data[i + 1],
                b: imageData.data[i + 2]
            });
        }

        if (colors.length === 0) {
            return { r: 255, g: 255, b: 255 };
        }

        return ColorUtils.getDominantColor(colors, 32);
    }
};
