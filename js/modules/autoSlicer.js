/**
 * Magic Pixel - 自动切片检测模块
 *
 * 自动检测图片中的内容块边界
 * 支持：单图检测（整图/区域）、多帧检测
 */

const AutoSlicer = {
    // 配置
    _config: {
        alphaThreshold: 10,      // 透明度阈值 (0-255)
        colorThreshold: 30,      // 颜色差异阈值
        minObjectSize: 4,        // 最小内容尺寸
        padding: 0               // 边距
    },

    // 回调函数
    _callbacks: {
        complete: [],
        progress: []
    },

    /**
     * 分析单张源图，提取所有独立块
     * @param {Object} source - 源图数据对象 { id, name, image, width, height }
     * @param {Object} config - 配置选项
     * @param {boolean} config.useTransparency - 使用透明背景检测
     * @param {boolean} config.useBackground - 使用背景色分离检测
     * @param {number} config.padding - 边距
     * @returns {Promise<Array>} Block 数组
     */
    async analyzeSource(source, config = {}) {
        const imageData = this._getImageData(source.image);
        if (!imageData) return [];

        const regions = this._detectAllRegions(imageData, config);

        // 转换为 Block 数组
        return this._createBlocksFromRegions(source, regions);
    },

    /**
     * 在指定区域内检测独立块
     * @param {Object} source - 源图数据对象
     * @param {Object} bounds - 框选范围 { x, y, width, height }
     * @param {Object} config - 配置选项
     * @returns {Promise<Array>} Block 数组
     */
    async analyzeRegion(source, bounds, config = {}) {
        const imageData = this._getImageDataInBounds(source.image, bounds);
        if (!imageData) return [];

        const regions = this._detectAllRegions(imageData, config);

        // 转换坐标（相对于原图）
        const adjustedRegions = regions.map(region => {
            // 转换像素坐标到原图坐标系
            let adjustedPixelCoords = null;
            if (region.pixelCoords && region.pixelCoords.size > 0) {
                adjustedPixelCoords = new Set();
                for (const coord of region.pixelCoords) {
                    const [px, py] = coord.split(',').map(Number);
                    adjustedPixelCoords.add(`${px + bounds.x},${py + bounds.y}`);
                }
            }

            return {
                x: region.x + bounds.x,
                y: region.y + bounds.y,
                width: region.width,
                height: region.height,
                confidence: region.confidence,
                pixels: region.pixels,
                pixelCoords: adjustedPixelCoords
            };
        });

        return this._createBlocksFromRegions(source, adjustedRegions);
    },

    /**
     * 检测所有独立区域
     * @param {Object} imageData - 像素数据
     * @param {Object} config - 配置选项
     * @returns {Array} 区域数组
     */
    _detectAllRegions(imageData, config = {}) {
        const useTransparency = config.useTransparency !== false;
        const useBackground = config.useBackground === true;
        const padding = config.padding || this._config.padding;

        // 先尝试透明背景检测
        if (useTransparency) {
            const transparencyRegions = this._detectRegionsByTransparency(imageData, padding);
            if (transparencyRegions.length > 0) {
                return transparencyRegions;
            }
        }

        // 再尝试背景色分离检测
        if (useBackground) {
            const bgColor = this._detectBackgroundColor(imageData.data, imageData.width, imageData.height);
            if (bgColor) {
                const bgRegions = this._detectMultipleRegions(imageData, bgColor, padding);
                if (bgRegions.length > 0) {
                    return bgRegions;
                }
            }
        }

        return [];
    },

    /**
     * 通过透明度检测多个独立区域
     * @param {Object} imageData - 像素数据
     * @param {number} padding - 边距
     * @returns {Array} 区域数组
     */
    _detectRegionsByTransparency(imageData, padding = 0) {
        const { width, height, data } = imageData;
        const threshold = this._config.alphaThreshold;
        const minSize = this._config.minObjectSize;

        // 创建内容掩码
        const mask = new Uint8Array(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const alpha = data[(y * width + x) * 4 + 3];
                if (alpha > threshold) {
                    mask[y * width + x] = 1;
                }
            }
        }

        // 连通区域标记
        return this._findConnectedRegions(mask, width, height, padding, minSize);
    },

    /**
     * 查找连通区域
     * @param {Uint8Array} mask - 内容掩码
     * @param {number} width - 宽度
     * @param {number} height - 高度
     * @param {number} padding - 边距
     * @param {number} minSize - 最小尺寸
     * @returns {Array} 区域数组
     */
    _findConnectedRegions(mask, width, height, padding, minSize) {
        const labels = new Int32Array(width * height);
        let labelCount = 0;
        const regions = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (mask[idx] === 1 && labels[idx] === 0) {
                    labelCount++;
                    const region = this._floodFillRegion(mask, labels, width, height, x, y, labelCount);

                    if (region.pixels >= minSize * minSize) {
                        regions.push({
                            x: Math.max(0, region.minX - padding),
                            y: Math.max(0, region.minY - padding),
                            width: Math.min(width - region.minX + padding, region.maxX - region.minX + 1 + padding * 2),
                            height: Math.min(height - region.minY + padding, region.maxY - region.minY + 1 + padding * 2),
                            pixels: region.pixels,
                            pixelCoords: region.pixelCoords, // 传递像素坐标集合
                            confidence: Math.min(1, region.pixels / ((region.maxX - region.minX + 1) * (region.maxY - region.minY + 1)))
                        });
                    }
                }
            }
        }

        // 按位置排序（从左到右，从上到下）
        // 动态计算行阈值：基于块的平均高度
        const avgHeight = regions.reduce((sum, r) => sum + (r.height || (r.maxY - r.minY + 1)), 0) / regions.length || 16;
        const rowThreshold = Math.max(avgHeight * 0.5, 1); // 至少为1像素

        regions.sort((a, b) => {
            const rowA = Math.floor(a.y / rowThreshold);
            const rowB = Math.floor(b.y / rowThreshold);
            if (rowA !== rowB) return rowA - rowB;
            return a.x - b.x;
        });
        return regions;
    },

    /**
     * 获取指定区域内的像素数据
     * @param {HTMLImageElement} image - 图片元素
     * @param {Object} bounds - 区域范围 { x, y, width, height }
     * @returns {Object|null} 像素数据
     */
    _getImageDataInBounds(image, bounds) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = bounds.width;
            canvas.height = bounds.height;
            const ctx = canvas.getContext('2d');

            // 裁剪指定区域
            ctx.drawImage(
                image,
                bounds.x, bounds.y, bounds.width, bounds.height,
                0, 0, bounds.width, bounds.height
            );

            const imageData = ctx.getImageData(0, 0, bounds.width, bounds.height);
            return {
                width: bounds.width,
                height: bounds.height,
                data: imageData.data
            };
        } catch (e) {
            console.error('获取区域像素数据失败:', e);
            return null;
        }
    },

    /**
     * 从检测到的区域创建 Block 数组
     * @param {Object} source - 源图数据
     * @param {Array} regions - 区域数组
     * @returns {Array} Block 数组
     */
    _createBlocksFromRegions(source, regions) {
        const baseName = source.name ? source.name.replace(/\.[^.]+$/, '') : 'sprite';

        return regions.map((region, index) => ({
            id: `block_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
            index: index,
            name: `${baseName}_${String(index + 1).padStart(2, '0')}`,

            // 来源信息
            sourceImage: source.image,
            sourceId: source.id,

            // 检测到的区域
            region: {
                x: region.x,
                y: region.y,
                width: region.width,
                height: region.height
            },

            // 像素坐标集合（用于精确裁剪）
            pixelCoords: region.pixelCoords || null,

            // 对齐偏移（后续计算）
            pivot: null,

            // 缓存的裁剪图像
            croppedCanvas: null,

            // 元数据
            metadata: {
                createdAt: Date.now(),
                confidence: region.confidence,
                pixels: region.pixels
            }
        }));
    },

    /**
     * 分析所有帧（保留原有方法，兼容旧流程）
     * @param {Array} frames - 帧数据数组
     * @param {Object} config - 配置选项
     * @returns {Promise<Array>} 帧数组
     */
    async analyzeAll(frames, config = {}) {
        // 合并配置
        if (config.padding !== undefined) {
            this._config.padding = Math.max(0, parseInt(config.padding) || 0);
        }

        const useTransparency = config.useTransparency !== false;
        const useBackground = config.useBackground === true;
        const autoSplit = config.autoSplit === true;
        const detectMultiple = config.detectMultiple === true || autoSplit;
        const padding = this._config.padding;

        let processed = 0;
        const resultFrames = [];

        for (const frame of frames) {
            // 获取图片数据
            const imageData = this._getImageData(frame.image);

            if (!imageData) {
                frame.region = null;
                resultFrames.push(frame);
                processed++;
                this._emit('progress', [processed, frames.length]);
                continue;
            }

            // 检测区域
            let region = null;
            let regions = null;

            if (useTransparency) {
                region = this._detectByTransparency(imageData, padding);
            }

            // 如果透明度检测失败或置信度低，尝试背景色检测
            if ((!region || region.confidence < 0.7) && useBackground) {
                // 先检测背景色
                const bgColor = this._detectBackgroundColor(imageData.data, imageData.width, imageData.height);

                if (bgColor) {
                    if (detectMultiple) {
                        // 检测多个区域
                        regions = this._detectMultipleRegions(imageData, bgColor, padding);

                        if (regions.length > 0) {
                            region = regions[0]; // 主区域

                            if (autoSplit && regions.length > 1) {
                                // 自动拆分为多个帧
                                const splitFrames = await this.splitFrameIntoRegions(frame, regions);
                                resultFrames.push(...splitFrames);
                                processed++;
                                this._emit('progress', [processed, frames.length]);
                                continue;
                            } else {
                                // 存储所有区域供后续使用
                                frame.regions = regions;
                            }
                        }
                    } else {
                        // 单区域检测
                        const bgRegion = this._detectByBackground(imageData, padding);
                        if (bgRegion && (!region || bgRegion.confidence > region.confidence)) {
                            region = bgRegion;
                        }
                    }
                }
            }

            // 存储结果
            frame.region = region;
            resultFrames.push(frame);

            processed++;
            this._emit('progress', [processed, frames.length]);
        }

        this._emit('complete', [resultFrames]);
        return resultFrames;
    },

    /**
     * 分析单帧
     * @param {Object} frame - 帧数据对象
     * @param {Object} config - 配置选项
     * @returns {Object|null} 检测结果 { x, y, width, height, confidence }
     */
    analyzeFrame(frame, config = {}) {
        const imageData = this._getImageData(frame.image);
        if (!imageData) return null;

        const useTransparency = config.useTransparency !== false;
        const useBackground = config.useBackground === true;
        const padding = config.padding || this._config.padding;

        let region = null;

        if (useTransparency) {
            region = this._detectByTransparency(imageData, padding);
        }

        if ((!region || region.confidence < 0.7) && useBackground) {
            const bgRegion = this._detectByBackground(imageData, padding);
            if (bgRegion && (!region || bgRegion.confidence > region.confidence)) {
                region = bgRegion;
            }
        }

        return region;
    },

    /**
     * 检测帧中的多个区域
     * @param {Object} frame - 帧数据对象
     * @param {Object} config - 配置选项
     * @returns {Array} 区域数组
     */
    detectMultipleRegions(frame, config = {}) {
        const imageData = this._getImageData(frame.image);
        if (!imageData) return [];

        const padding = config.padding || this._config.padding;

        // 检测背景色
        const bgColor = this._detectBackgroundColor(imageData.data, imageData.width, imageData.height);
        if (!bgColor) return [];

        // 检测多个区域
        return this._detectMultipleRegions(imageData, bgColor, padding);
    },

    /**
     * 获取图片像素数据
     * @param {HTMLImageElement} image - 图片元素
     * @returns {Object|null} 像素数据 { width, height, data }
     */
    _getImageData(image) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            const imageData = ctx.getImageData(0, 0, image.width, image.height);
            return {
                width: image.width,
                height: image.height,
                data: imageData.data
            };
        } catch (e) {
            console.error('获取像素数据失败:', e);
            return null;
        }
    },

    /**
     * 通过透明度检测内容边界
     * @param {Object} imageData - 像素数据
     * @param {number} padding - 边距
     * @returns {Object|null} 区域信息 { x, y, width, height, confidence }
     */
    _detectByTransparency(imageData, padding = 0) {
        const { width, height, data } = imageData;
        const threshold = this._config.alphaThreshold;

        let minX = width, maxX = 0, minY = height, maxY = 0;
        let contentPixels = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const alpha = data[(y * width + x) * 4 + 3];

                if (alpha > threshold) {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                    contentPixels++;
                }
            }
        }

        // 没有找到内容
        if (contentPixels === 0) {
            return null;
        }

        // 计算带边距的区域
        const regionX = Math.max(0, minX - padding);
        const regionY = Math.max(0, minY - padding);
        const regionW = Math.min(width - regionX, maxX - minX + 1 + padding * 2);
        const regionH = Math.min(height - regionY, maxY - minY + 1 + padding * 2);

        // 计算置信度（基于内容像素占比）
        const regionPixels = regionW * regionH;
        const confidence = Math.min(1, contentPixels / regionPixels);

        return {
            x: regionX,
            y: regionY,
            width: regionW,
            height: regionH,
            confidence: confidence,
            method: 'transparency'
        };
    },

    /**
     * 通过背景色分离检测内容边界
     * @param {Object} imageData - 像素数据
     * @param {number} padding - 边距
     * @returns {Object|null} 区域信息 { x, y, width, height, confidence }
     */
    _detectByBackground(imageData, padding = 0) {
        const { width, height, data } = imageData;

        // 检测背景色（从边缘采样）
        const bgColor = this._detectBackgroundColor(data, width, height);

        if (!bgColor) {
            return null;
        }

        // 找出与背景色不同的区域
        const threshold = this._config.colorThreshold;
        let minX = width, maxX = 0, minY = height, maxY = 0;
        let contentPixels = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];

                // 检查是否与背景色不同（使用欧氏距离）
                const diffR = Math.abs(r - bgColor.r);
                const diffG = Math.abs(g - bgColor.g);
                const diffB = Math.abs(b - bgColor.b);
                const colorDistance = Math.sqrt(diffR * diffR + diffG * diffG + diffB * diffB);

                if (colorDistance > threshold || a < 255 - threshold) {
                    minX = Math.min(minX, x);
                    maxX = Math.max(maxX, x);
                    minY = Math.min(minY, y);
                    maxY = Math.max(maxY, y);
                    contentPixels++;
                }
            }
        }

        // 没有找到内容
        if (contentPixels === 0) {
            return null;
        }

        // 计算带边距的区域
        const regionX = Math.max(0, minX - padding);
        const regionY = Math.max(0, minY - padding);
        const regionW = Math.min(width - regionX, maxX - minX + 1 + padding * 2);
        const regionH = Math.min(height - regionY, maxY - minY + 1 + padding * 2);

        // 计算置信度
        const regionPixels = regionW * regionH;
        const confidence = Math.min(1, contentPixels / regionPixels) * 0.9;

        return {
            x: regionX,
            y: regionY,
            width: regionW,
            height: regionH,
            confidence: confidence,
            method: 'background'
        };
    },

    /**
     * 检测背景色（从边缘采样）
     * @param {Uint8ClampedArray} data - 像素数据
     * @param {number} width - 图片宽度
     * @param {number} height - 图片高度
     * @returns {Object|null} 背景色 { r, g, b, a }
     */
    _detectBackgroundColor(data, width, height) {
        const edgePixels = [];

        // 采样四个边缘的像素
        for (let x = 0; x < width; x++) {
            // 顶边
            edgePixels.push(this._getPixel(data, x, 0, width));
            // 底边
            edgePixels.push(this._getPixel(data, x, height - 1, width));
        }
        for (let y = 0; y < height; y++) {
            // 左边
            edgePixels.push(this._getPixel(data, 0, y, width));
            // 右边
            edgePixels.push(this._getPixel(data, width - 1, y, width));
        }

        // 找最常见的颜色
        const colorCounts = new Map();
        for (const pixel of edgePixels) {
            // 量化颜色以减少噪声（使用更小的步长提高精度）
            const key = `${Math.round(pixel.r / 5) * 5},${Math.round(pixel.g / 5) * 5},${Math.round(pixel.b / 5) * 5},${pixel.a}`;
            colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
        }

        const totalPixels = edgePixels.length;
        let maxCount = 0;
        let bgColor = null;

        for (const [key, count] of colorCounts) {
            if (count > maxCount) {
                maxCount = count;
                const [r, g, b, a] = key.split(',').map(Number);
                bgColor = { r, g, b, a };
            }
        }

        // 背景色必须占边缘像素的至少30%，否则检测不可靠
        if (maxCount < totalPixels * 0.3) {
            console.warn('背景色检测不可靠，占比过低:', (maxCount / totalPixels * 100).toFixed(1) + '%');
            return null;
        }

        return bgColor;
    },

    /**
     * 获取单个像素颜色
     * @param {Uint8ClampedArray} data - 像素数据
     * @param {number} x - X 坐标
     * @param {number} y - Y 坐标
     * @param {number} width - 图片宽度
     * @returns {Object} 颜色对象 { r, g, b, a }
     */
    _getPixel(data, x, y, width) {
        const idx = (y * width + x) * 4;
        return {
            r: data[idx],
            g: data[idx + 1],
            b: data[idx + 2],
            a: data[idx + 3]
        };
    },

    /**
     * 检测多个独立内容区域（连通区域分析）
     * @param {Object} imageData - 像素数据
     * @param {Object} bgColor - 背景色
     * @param {number} padding - 边距
     * @returns {Array} 区域数组 [{ x, y, width, height, confidence, pixelCoords }, ...]
     */
    _detectMultipleRegions(imageData, bgColor, padding = 0) {
        const { width, height, data } = imageData;
        const threshold = this._config.colorThreshold;
        const minSize = this._config.minObjectSize;

        // 创建内容掩码
        const mask = new Uint8Array(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
                const colorDist = Math.sqrt(
                    (r - bgColor.r) ** 2 +
                    (g - bgColor.g) ** 2 +
                    (b - bgColor.b) ** 2
                );
                if (colorDist > threshold || a < 255 - threshold) {
                    mask[y * width + x] = 1;
                }
            }
        }

        // 连通区域标记（使用 flood fill）
        const labels = new Int32Array(width * height);
        let labelCount = 0;
        const regions = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                if (mask[idx] === 1 && labels[idx] === 0) {
                    labelCount++;
                    const region = this._floodFillRegion(mask, labels, width, height, x, y, labelCount);
                    // 过滤太小的区域
                    if (region.pixels >= minSize * minSize) {
                        regions.push({
                            x: Math.max(0, region.minX - padding),
                            y: Math.max(0, region.minY - padding),
                            width: Math.min(width - region.minX + padding, region.maxX - region.minX + 1 + padding * 2),
                            height: Math.min(height - region.minY + padding, region.maxY - region.minY + 1 + padding * 2),
                            pixels: region.pixels,
                            pixelCoords: region.pixelCoords, // 传递像素坐标集合
                            confidence: Math.min(1, region.pixels / ((region.maxX - region.minX + 1) * (region.maxY - region.minY + 1)))
                        });
                    }
                }
            }
        }

        // 按位置排序（从左到右，从上到下）
        // 动态计算行阈值：基于块的平均高度
        const avgHeight = regions.reduce((sum, r) => sum + (r.height || (r.maxY - r.minY + 1)), 0) / regions.length || 16;
        const rowThreshold = Math.max(avgHeight * 0.5, 1); // 至少为1像素

        regions.sort((a, b) => {
            const rowA = Math.floor(a.y / rowThreshold);
            const rowB = Math.floor(b.y / rowThreshold);
            if (rowA !== rowB) return rowA - rowB;
            return a.x - b.x;
        });

        return regions;
    },

    /**
     * 洪水填充获取连通区域边界
     * @param {Uint8Array} mask - 内容掩码
     * @param {Int32Array} labels - 标签数组
     * @param {number} width - 图片宽度
     * @param {number} height - 图片高度
     * @param {number} startX - 起始X坐标
     * @param {number} startY - 起始Y坐标
     * @param {number} label - 当前标签
     * @returns {Object} 区域边界信息 { minX, maxX, minY, maxY, pixels, pixelCoords }
     */
    _floodFillRegion(mask, labels, width, height, startX, startY, label) {
        const stack = [[startX, startY]];
        let minX = startX, maxX = startX, minY = startY, maxY = startY;
        let pixels = 0;
        const pixelCoords = new Set(); // 存储属于该区域的所有像素坐标

        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const idx = y * width + x;

            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            if (mask[idx] !== 1 || labels[idx] !== 0) continue;

            labels[idx] = label;
            pixels++;
            pixelCoords.add(`${x},${y}`); // 记录像素坐标
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);

            // 4邻域扩展
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }

        return { minX, maxX, minY, maxY, pixels, pixelCoords };
    },

    /**
     * 将单帧拆分为多个独立帧
     * @param {Object} frame - 原始帧数据
     * @param {Array} regions - 检测到的区域数组
     * @returns {Promise<Array>} 拆分后的帧数组
     */
    async splitFrameIntoRegions(frame, regions) {
        const newFrames = [];

        // 先获取原图的像素数据
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = frame.image.width;
        sourceCanvas.height = frame.image.height;
        const sourceCtx = sourceCanvas.getContext('2d');
        sourceCtx.drawImage(frame.image, 0, 0);
        const sourceImageData = sourceCtx.getImageData(0, 0, frame.image.width, frame.image.height);

        for (let i = 0; i < regions.length; i++) {
            const region = regions[i];

            // 创建新画布
            const canvas = document.createElement('canvas');
            canvas.width = region.width;
            canvas.height = region.height;
            const ctx = canvas.getContext('2d');

            // 创建输出像素数据（初始全透明）
            const outputData = ctx.createImageData(region.width, region.height);

            // 如果有像素坐标集合，只复制属于该区域的像素
            if (region.pixelCoords && region.pixelCoords.size > 0) {
                for (const coord of region.pixelCoords) {
                    const [px, py] = coord.split(',').map(Number);
                    const localX = px - region.x;
                    const localY = py - region.y;

                    // 确保坐标在输出范围内
                    if (localX >= 0 && localX < region.width && localY >= 0 && localY < region.height) {
                        const srcIdx = (py * frame.image.width + px) * 4;
                        const dstIdx = (localY * region.width + localX) * 4;

                        outputData.data[dstIdx] = sourceImageData.data[srcIdx];
                        outputData.data[dstIdx + 1] = sourceImageData.data[srcIdx + 1];
                        outputData.data[dstIdx + 2] = sourceImageData.data[srcIdx + 2];
                        outputData.data[dstIdx + 3] = sourceImageData.data[srcIdx + 3];
                    }
                }
            } else {
                // 没有像素坐标集合时，回退到矩形裁剪
                for (let y = 0; y < region.height; y++) {
                    for (let x = 0; x < region.width; x++) {
                        const srcX = region.x + x;
                        const srcY = region.y + y;
                        const srcIdx = (srcY * frame.image.width + srcX) * 4;
                        const dstIdx = (y * region.width + x) * 4;

                        outputData.data[dstIdx] = sourceImageData.data[srcIdx];
                        outputData.data[dstIdx + 1] = sourceImageData.data[srcIdx + 1];
                        outputData.data[dstIdx + 2] = sourceImageData.data[srcIdx + 2];
                        outputData.data[dstIdx + 3] = sourceImageData.data[srcIdx + 3];
                    }
                }
            }

            ctx.putImageData(outputData, 0, 0);

            // 创建新图片
            const newImage = await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.src = canvas.toDataURL('image/png');
            });

            const baseName = frame.name.replace(/\.[^.]+$/, '');

            newFrames.push({
                id: `${frame.id}_split_${i}`,
                index: frame.index + i * 0.01,
                name: `${baseName}_${i + 1}.png`,
                image: newImage,
                width: region.width,
                height: region.height,
                region: { x: 0, y: 0, width: region.width, height: region.height, confidence: region.confidence },
                sourceFrame: frame.id,
                splitIndex: i,
                isSplit: true
            });
        }

        return newFrames;
    },

    /**
     * 更新配置
     * @param {Object} config - 配置对象
     */
    setConfig(config) {
        Object.assign(this._config, config);
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
                    console.error(`AutoSlicer callback error [${event}]:`, error);
                }
            });
        }
    },

    /**
     * 将区域精确渲染到 Canvas（静态方法，供其他模块调用）
     * @param {HTMLImageElement} image - 源图像
     * @param {Object} region - 区域信息 { x, y, width, height }
     * @param {Set<string>} pixelCoords - 像素坐标集合（可选）
     * @param {CanvasRenderingContext2D} ctx - 目标 Canvas 上下文
     * @param {number} dx - 目标 X 坐标
     * @param {number} dy - 目标 Y 坐标
     */
    renderRegionToCanvas(image, region, pixelCoords, ctx, dx, dy) {
        if (!region || !image) return;

        // 如果有像素坐标集合，使用精确绘制
        if (pixelCoords && pixelCoords.size > 0) {
            // 创建临时画布获取原图像素数据
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = image.width;
            tempCanvas.height = image.height;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(image, 0, 0);
            const sourceData = tempCtx.getImageData(0, 0, image.width, image.height);

            // 创建输出像素数据
            const outputData = ctx.createImageData(region.width, region.height);

            // 只复制属于该区域的像素
            for (const coord of pixelCoords) {
                const [px, py] = coord.split(',').map(Number);
                const localX = px - region.x;
                const localY = py - region.y;

                if (localX >= 0 && localX < region.width && localY >= 0 && localY < region.height) {
                    const srcIdx = (py * image.width + px) * 4;
                    const dstIdx = (localY * region.width + localX) * 4;

                    outputData.data[dstIdx] = sourceData.data[srcIdx];
                    outputData.data[dstIdx + 1] = sourceData.data[srcIdx + 1];
                    outputData.data[dstIdx + 2] = sourceData.data[srcIdx + 2];
                    outputData.data[dstIdx + 3] = sourceData.data[srcIdx + 3];
                }
            }

            // 创建临时画布存放输出数据
            const outputCanvas = document.createElement('canvas');
            outputCanvas.width = region.width;
            outputCanvas.height = region.height;
            const outputCtx = outputCanvas.getContext('2d');
            outputCtx.putImageData(outputData, 0, 0);

            // 绘制到目标位置
            ctx.drawImage(outputCanvas, dx, dy);
        } else {
            // 没有像素坐标集合时，回退到矩形绘制
            ctx.drawImage(
                image,
                region.x, region.y, region.width, region.height,
                dx, dy, region.width, region.height
            );
        }
    },

    /**
     * 创建区域的精确裁剪 Canvas（静态方法，供其他模块调用）
     * @param {HTMLImageElement} image - 源图像
     * @param {Object} region - 区域信息 { x, y, width, height }
     * @param {Set<string>} pixelCoords - 像素坐标集合（可选）
     * @returns {HTMLCanvasElement} 裁剪后的 Canvas
     */
    createCroppedCanvas(image, region, pixelCoords) {
        const canvas = document.createElement('canvas');
        canvas.width = region.width;
        canvas.height = region.height;
        const ctx = canvas.getContext('2d');

        this.renderRegionToCanvas(image, region, pixelCoords, ctx, 0, 0);

        return canvas;
    }
};
