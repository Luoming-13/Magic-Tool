/**
 * Magic Pixel - 网格智能检测模块
 *
 * 通过多种策略识别图片的最佳切割行列数
 */

const GridDetector = {
    // 配置
    _config: {
        // 透明度阈值（0-255），低于此值视为透明
        alphaThreshold: 10,
        // 颜色差异阈值
        colorThreshold: 30,
        // 最小主体尺寸（像素）
        minObjectSize: 16,
        // 最大格子数
        maxGridSize: 50,
        // 常见像素尺寸（用于推算）
        commonSizes: [8, 16, 24, 32, 48, 64, 96, 128]
    },

    // 检测结果缓存
    _lastResult: null,

    /**
     * 检测图片的最佳网格行列数
     * @param {HTMLImageElement} image - 图片元素
     * @returns {Object} 检测结果 { cols, rows, confidence, method }
     */
    detect(image) {
        if (!image || !image.complete) {
            return this._getDefaultResult();
        }

        // 1. 获取像素数据
        const imageData = this._getImageData(image);
        if (!imageData) {
            return this._getDefaultResult();
        }

        const { width, height } = imageData;

        // 2. 策略一：透明背景连通区域检测
        const transparentResult = this._detectByTransparency(imageData);

        // 3. 策略二：背景色分离检测
        const backgroundResult = this._detectByBackground(imageData);

        // 4. 策略三：等间距网格推算
        const gridResult = this._detectByGridPattern(imageData);

        // 5. 选择最佳结果
        const results = [
            { ...transparentResult, priority: 1 },
            { ...backgroundResult, priority: 2 },
            { ...gridResult, priority: 3 }
        ].filter(r => r && r.confidence > 0);

        if (results.length === 0) {
            return this._getDefaultResult();
        }

        // 按置信度和优先级排序
        results.sort((a, b) => {
            // 置信度差异大时，优先置信度
            if (Math.abs(a.confidence - b.confidence) > 0.2) {
                return b.confidence - a.confidence;
            }
            // 置信度相近时，优先级低的（更精确的方法）优先
            return a.priority - b.priority;
        });

        this._lastResult = results[0];
        return results[0];
    },

    /**
     * 获取图片像素数据
     */
    _getImageData(image) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(image, 0, 0);
            const imageData = ctx.getImageData(0, 0, image.width, image.height);
            return { ...imageData, width: image.width, height: image.height };
        } catch (e) {
            console.error('获取像素数据失败:', e);
            return null;
        }
    },

    // ==================== 策略一：透明背景检测 ====================

    /**
     * 通过透明像素检测连通区域
     */
    _detectByTransparency(imageData) {
        const { width, height, data } = imageData;
        const visited = new Uint8Array(width * height);
        const objects = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;

                if (visited[idx]) continue;

                const alpha = data[idx * 4 + 3];
                if (alpha <= this._config.alphaThreshold) {
                    visited[idx] = 1;
                    continue;
                }

                const region = this._floodFillTransparent(data, width, height, x, y, visited);

                if (region.pixelCount >= this._config.minObjectSize) {
                    objects.push({
                        bounds: region.bounds,
                        centerX: (region.bounds.minX + region.bounds.maxX) / 2,
                        centerY: (region.bounds.minY + region.bounds.maxY) / 2
                    });
                }
            }
        }

        if (objects.length <= 1) {
            return { cols: 1, rows: 1, confidence: 0, method: 'transparent' };
        }

        return this._analyzeObjectGrid(objects, width, height, 'transparent');
    },

    /**
     * 洪水填充（基于透明度）
     */
    _floodFillTransparent(data, width, height, startX, startY, visited) {
        const bounds = { minX: startX, maxX: startX, minY: startY, maxY: startY };
        let pixelCount = 0;
        const stack = [[startX, startY]];

        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const idx = y * width + x;

            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            if (visited[idx]) continue;

            const alpha = data[idx * 4 + 3];
            if (alpha <= this._config.alphaThreshold) {
                visited[idx] = 1;
                continue;
            }

            visited[idx] = 1;
            pixelCount++;

            bounds.minX = Math.min(bounds.minX, x);
            bounds.maxX = Math.max(bounds.maxX, x);
            bounds.minY = Math.min(bounds.minY, y);
            bounds.maxY = Math.max(bounds.maxY, y);

            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }

        return { bounds, pixelCount };
    },

    // ==================== 策略二：背景色分离检测 ====================

    /**
     * 通过检测背景色来分离主体
     */
    _detectByBackground(imageData) {
        const { width, height, data } = imageData;

        // 检测背景色（取四个角的颜色，找最常见的）
        const bgColor = this._detectBackgroundColor(data, width, height);
        if (!bgColor) {
            return { cols: 1, rows: 1, confidence: 0, method: 'background' };
        }

        // 找出与背景色不同的连通区域
        const visited = new Uint8Array(width * height);
        const objects = [];

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;

                if (visited[idx]) continue;

                // 检查是否为背景色
                if (this._isBackgroundColor(data, idx, bgColor)) {
                    visited[idx] = 1;
                    continue;
                }

                const region = this._floodFillBackground(data, width, height, x, y, visited, bgColor);

                if (region.pixelCount >= this._config.minObjectSize) {
                    objects.push({
                        bounds: region.bounds,
                        centerX: (region.bounds.minX + region.bounds.maxX) / 2,
                        centerY: (region.bounds.minY + region.bounds.maxY) / 2
                    });
                }
            }
        }

        if (objects.length <= 1) {
            return { cols: 1, rows: 1, confidence: 0, method: 'background' };
        }

        return this._analyzeObjectGrid(objects, width, height, 'background');
    },

    /**
     * 检测背景色（从边缘像素采样）
     */
    _detectBackgroundColor(data, width, height) {
        const edgePixels = [];

        // 采样四个边缘的像素
        for (let x = 0; x < width; x++) {
            edgePixels.push(this._getPixel(data, x, 0, width));           // 顶边
            edgePixels.push(this._getPixel(data, x, height - 1, width));  // 底边
        }
        for (let y = 0; y < height; y++) {
            edgePixels.push(this._getPixel(data, 0, y, width));           // 左边
            edgePixels.push(this._getPixel(data, width - 1, y, width));   // 右边
        }

        // 找最常见的颜色
        const colorCounts = new Map();
        for (const pixel of edgePixels) {
            const key = `${pixel.r},${pixel.g},${pixel.b},${pixel.a}`;
            colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
        }

        let maxCount = 0;
        let bgColor = null;
        for (const [key, count] of colorCounts) {
            if (count > maxCount) {
                maxCount = count;
                const [r, g, b, a] = key.split(',').map(Number);
                bgColor = { r, g, b, a };
            }
        }

        return bgColor;
    },

    /**
     * 获取像素颜色
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
     * 判断是否为背景色
     */
    _isBackgroundColor(data, idx, bgColor) {
        const r = data[idx * 4];
        const g = data[idx * 4 + 1];
        const b = data[idx * 4 + 2];
        const a = data[idx * 4 + 3];

        return Math.abs(r - bgColor.r) <= this._config.colorThreshold &&
               Math.abs(g - bgColor.g) <= this._config.colorThreshold &&
               Math.abs(b - bgColor.b) <= this._config.colorThreshold;
    },

    /**
     * 洪水填充（基于背景色）
     */
    _floodFillBackground(data, width, height, startX, startY, visited, bgColor) {
        const bounds = { minX: startX, maxX: startX, minY: startY, maxY: startY };
        let pixelCount = 0;
        const stack = [[startX, startY]];

        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const idx = y * width + x;

            if (x < 0 || x >= width || y < 0 || y >= height) continue;
            if (visited[idx]) continue;
            if (this._isBackgroundColor(data, idx, bgColor)) {
                visited[idx] = 1;
                continue;
            }

            visited[idx] = 1;
            pixelCount++;

            bounds.minX = Math.min(bounds.minX, x);
            bounds.maxX = Math.max(bounds.maxX, x);
            bounds.minY = Math.min(bounds.minY, y);
            bounds.maxY = Math.max(bounds.maxY, y);

            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }

        return { bounds, pixelCount };
    },

    // ==================== 策略三：等间距网格推算 ====================

    /**
     * 通过分析图片规律性推算网格
     */
    _detectByGridPattern(imageData) {
        const { width, height, data } = imageData;

        // 尝试常见的网格分割
        const candidates = [];

        // 遍历可能的行列组合
        for (let cols = 2; cols <= Math.min(16, this._config.maxGridSize); cols++) {
            for (let rows = 2; rows <= Math.min(16, this._config.maxGridSize); rows++) {
                const cellWidth = width / cols;
                const cellHeight = height / rows;

                // 只检查能整除的情况
                if (width % cols !== 0 || height % rows !== 0) continue;

                // 检查网格规律性
                const regularity = this._checkGridRegularity(data, width, height, cols, rows);

                if (regularity > 0.3) {
                    candidates.push({ cols, rows, confidence: regularity });
                }
            }
        }

        if (candidates.length === 0) {
            // 尝试基于常见尺寸推算
            return this._detectBySizeHint(width, height);
        }

        // 选择规律性最高的
        candidates.sort((a, b) => b.confidence - a.confidence);
        const best = candidates[0];

        return {
            cols: best.cols,
            rows: best.rows,
            confidence: best.confidence,
            method: 'gridPattern'
        };
    },

    /**
     * 检查网格规律性
     */
    _checkGridRegularity(data, width, height, cols, rows) {
        const cellWidth = Math.floor(width / cols);
        const cellHeight = Math.floor(height / rows);

        if (cellWidth < 4 || cellHeight < 4) return 0;

        // 采样每个格子的特征（使用低分辨率比较）
        const features = [];

        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const feature = this._extractCellFeature(
                    data, width, height,
                    col * cellWidth, row * cellHeight,
                    cellWidth, cellHeight
                );
                features.push(feature);
            }
        }

        // 计算格子之间的相似度
        // 规律性好的精灵图，各格子应该有相似的"活跃度"（非背景像素比例）
        const activities = features.map(f => f.activity);
        const avgActivity = activities.reduce((a, b) => a + b, 0) / activities.length;

        if (avgActivity < 0.05) return 0; // 整张图几乎是空的

        // 计算活跃度的变异系数
        const variance = activities.reduce((sum, a) => sum + Math.pow(a - avgActivity, 2), 0) / activities.length;
        const cv = Math.sqrt(variance) / avgActivity;

        // 变异系数越小，规律性越高
        const regularity = Math.max(0, 1 - cv);

        // 额外检查：格子边界是否整齐
        const edgeScore = this._checkEdgeAlignment(data, width, height, cols, rows);

        return regularity * 0.7 + edgeScore * 0.3;
    },

    /**
     * 提取格子特征
     */
    _extractCellFeature(data, imgWidth, imgHeight, x, y, w, h) {
        let nonEmpty = 0;
        let totalR = 0, totalG = 0, totalB = 0;
        let samples = 0;

        // 采样格子内的像素（跳跃采样提高速度）
        const step = Math.max(1, Math.floor(Math.min(w, h) / 8));

        for (let dy = 0; dy < h; dy += step) {
            for (let dx = 0; dx < w; dx += step) {
                const px = x + dx;
                const py = y + dy;
                const idx = (py * imgWidth + px) * 4;

                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];

                samples++;
                if (a > 20) {
                    nonEmpty++;
                    totalR += r;
                    totalG += g;
                    totalB += b;
                }
            }
        }

        return {
            activity: samples > 0 ? nonEmpty / samples : 0,
            avgColor: nonEmpty > 0 ? {
                r: totalR / nonEmpty,
                g: totalG / nonEmpty,
                b: totalB / nonEmpty
            } : null
        };
    },

    /**
     * 检查格子边缘对齐情况
     */
    _checkEdgeAlignment(data, width, height, cols, rows) {
        const cellWidth = Math.floor(width / cols);
        const cellHeight = Math.floor(height / rows);

        // 检查垂直分割线
        let vEdgeScore = 0;
        for (let c = 1; c < cols; c++) {
            const x = c * cellWidth;
            let emptyPixels = 0;
            for (let y = 0; y < height; y++) {
                const idx = (y * width + x) * 4 + 3;
                if (data[idx] < 20) emptyPixels++;
            }
            vEdgeScore += emptyPixels / height;
        }
        vEdgeScore = vEdgeScore / (cols - 1);

        // 检查水平分割线
        let hEdgeScore = 0;
        for (let r = 1; r < rows; r++) {
            const y = r * cellHeight;
            let emptyPixels = 0;
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4 + 3;
                if (data[idx] < 20) emptyPixels++;
            }
            hEdgeScore += emptyPixels / width;
        }
        hEdgeScore = hEdgeScore / (rows - 1);

        return (vEdgeScore + hEdgeScore) / 2;
    },

    // ==================== 通用方法 ====================

    /**
     * 分析主体分布，推算网格
     */
    _analyzeObjectGrid(objects, imgWidth, imgHeight, method) {
        // 按中心点坐标聚类
        const xPositions = objects.map(o => o.centerX).sort((a, b) => a - b);
        const yPositions = objects.map(o => o.centerY).sort((a, b) => a - b);

        const cols = this._clusterPositions(xPositions, imgWidth);
        const rows = this._clusterPositions(yPositions, imgHeight);

        // 计算置信度
        const expectedCount = cols * rows;
        const actualCount = objects.length;
        const matchRatio = Math.min(actualCount, expectedCount) / Math.max(actualCount, expectedCount);

        const confidence = matchRatio * 0.7 + this._calculateRegularity(objects) * 0.3;

        return {
            cols: Math.min(cols, this._config.maxGridSize),
            rows: Math.min(rows, this._config.maxGridSize),
            confidence: Math.min(1, confidence),
            method: method,
            objectCount: objects.length
        };
    },

    /**
     * 位置聚类
     */
    _clusterPositions(positions, totalSize) {
        if (positions.length <= 1) return positions.length || 1;

        // 计算间距
        const gaps = [];
        for (let i = 1; i < positions.length; i++) {
            gaps.push(positions[i] - positions[i - 1]);
        }

        // 找到明显的大间隙（表示不同的列/行）
        const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;

        let clusters = 1;
        for (let i = 1; i < positions.length; i++) {
            // 如果间距明显大于平均间距，说明是新的一列/行
            if (positions[i] - positions[i - 1] > avgGap * 0.8) {
                clusters++;
            }
        }

        return clusters;
    },

    /**
     * 计算主体尺寸规律性
     */
    _calculateRegularity(objects) {
        if (objects.length < 2) return 0;

        const widths = objects.map(o => o.bounds.maxX - o.bounds.minX);
        const heights = objects.map(o => o.bounds.maxY - o.bounds.minY);

        const avgW = widths.reduce((a, b) => a + b, 0) / widths.length;
        const avgH = heights.reduce((a, b) => a + b, 0) / heights.length;

        const cvW = Math.sqrt(widths.reduce((s, w) => s + Math.pow(w - avgW, 2), 0) / widths.length) / avgW;
        const cvH = Math.sqrt(heights.reduce((s, h) => s + Math.pow(h - avgH, 2), 0) / heights.length) / avgH;

        return Math.max(0, 1 - (cvW + cvH) / 2);
    },

    /**
     * 基于尺寸推算（兜底策略）
     */
    _detectBySizeHint(width, height) {
        const cols = this._guessGridCount(width);
        const rows = this._guessGridCount(height);

        const colsConfidence = width % (width / cols) === 0 ? 0.4 : 0.2;
        const rowsConfidence = height % (height / rows) === 0 ? 0.4 : 0.2;

        return {
            cols,
            rows,
            confidence: (colsConfidence + rowsConfidence) / 2,
            method: 'sizeHint'
        };
    },

    /**
     * 根据尺寸推测格子数
     */
    _guessGridCount(size) {
        for (const cellSize of this._config.commonSizes) {
            if (size % cellSize === 0) {
                const count = size / cellSize;
                if (count >= 1 && count <= this._config.maxGridSize) {
                    return count;
                }
            }
        }

        // 找能整除的组合
        for (let n = 2; n <= Math.min(16, this._config.maxGridSize); n++) {
            if (size % n === 0 && size / n >= 8) {
                return n;
            }
        }

        return 1;
    },

    /**
     * 获取默认结果
     */
    _getDefaultResult() {
        return {
            cols: 1,
            rows: 1,
            confidence: 0,
            method: 'default'
        };
    },

    /**
     * 获取上次检测结果
     */
    getLastResult() {
        return this._lastResult;
    },

    /**
     * 更新配置
     */
    setConfig(config) {
        Object.assign(this._config, config);
    }
};
