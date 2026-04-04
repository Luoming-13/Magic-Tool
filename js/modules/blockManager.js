/**
 * Magic Pixel - 块管理模块
 *
 * 管理从源图提取的所有块（Block）
 * 核心功能：增删改查、计算统一网格尺寸、拖拽排序
 */

const BlockManager = {
    // 块列表
    _blocks: [],

    // 统一网格尺寸
    _maxSize: null,

    /**
     * 初始化
     */
    init() {
        this._blocks = [];
        this._maxSize = null;
    },

    /**
     * 设置块列表（替换现有）
     * @param {Array} blocks - 块数组
     */
    setBlocks(blocks) {
        this._blocks = blocks || [];
        this._updateIndices();
        this._maxSize = null;
    },

    /**
     * 批量添加块
     * @param {Array} newBlocks - 新块数组
     */
    addBlocks(newBlocks) {
        if (!newBlocks || newBlocks.length === 0) return;

        const startIndex = this._blocks.length;
        newBlocks.forEach((block, i) => {
            block.index = startIndex + i;
            this._blocks.push(block);
        });

        // 清除缓存的网格尺寸
        this._maxSize = null;
    },

    /**
     * 添加单个块
     * @param {Object} block - 块对象
     */
    addBlock(block) {
        block.index = this._blocks.length;
        this._blocks.push(block);
        this._maxSize = null;
    },

    /**
     * 删除块
     * @param {string} blockId - 块ID
     * @returns {boolean} 是否删除成功
     */
    removeBlock(blockId) {
        const index = this._blocks.findIndex(b => b.id === blockId);
        if (index === -1) return false;

        this._blocks.splice(index, 1);
        this._updateIndices();
        this._maxSize = null;

        return true;
    },

    /**
     * 删除最后一个块
     * @returns {Object|null} 被删除的块
     */
    removeLastBlock() {
        if (this._blocks.length === 0) return null;

        const removed = this._blocks.pop();
        this._updateIndices();
        this._maxSize = null;

        return removed;
    },

    /**
     * 清除所有块
     */
    clear() {
        this._blocks = [];
        this._maxSize = null;
    },

    /**
     * 重新排序块
     * @param {number} fromIndex - 原索引
     * @param {number} toIndex - 目标索引
     */
    reorderBlocks(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        if (fromIndex < 0 || fromIndex >= this._blocks.length) return;
        if (toIndex < 0 || toIndex >= this._blocks.length) return;

        const [moved] = this._blocks.splice(fromIndex, 1);
        this._blocks.splice(toIndex, 0, moved);

        this._updateIndices();
    },

    /**
     * 更新所有块的索引
     */
    _updateIndices() {
        this._blocks.forEach((block, index) => {
            block.index = index;
        });
    },

    /**
     * 获取所有块
     * @returns {Array} 块数组
     */
    getBlocks() {
        return this._blocks;
    },

    /**
     * 获取有效块（有区域信息的）
     * @returns {Array} 有效块数组
     */
    getValidBlocks() {
        return this._blocks.filter(b => b.region && b.region.width > 0 && b.region.height > 0);
    },

    /**
     * 获取块数量
     * @returns {number}
     */
    getCount() {
        return this._blocks.length;
    },

    /**
     * 根据ID获取块
     * @param {string} blockId - 块ID
     * @returns {Object|null}
     */
    getBlockById(blockId) {
        return this._blocks.find(b => b.id === blockId) || null;
    },

    /**
     * 根据索引获取块
     * @param {number} index - 索引
     * @returns {Object|null}
     */
    getBlockByIndex(index) {
        return this._blocks[index] || null;
    },

    /**
     * 计算统一网格尺寸（所有块的最大宽高）
     * @returns {Object} { width, height }
     */
    calculateMaxSize() {
        const validBlocks = this.getValidBlocks();

        if (validBlocks.length === 0) {
            this._maxSize = { width: 0, height: 0 };
            return this._maxSize;
        }

        let maxWidth = 0;
        let maxHeight = 0;

        for (const block of validBlocks) {
            maxWidth = Math.max(maxWidth, block.region.width);
            maxHeight = Math.max(maxHeight, block.region.height);
        }

        this._maxSize = { width: maxWidth, height: maxHeight };
        return this._maxSize;
    },

    /**
     * 获取缓存的网格尺寸
     * @returns {Object|null}
     */
    getMaxSize() {
        if (!this._maxSize) {
            this.calculateMaxSize();
        }
        return this._maxSize;
    },

    /**
     * 创建块对象
     * @param {Object} source - 源图对象
     * @param {Object} region - 区域 { x, y, width, height }
     * @param {number} index - 索引
     * @param {Set<string>} pixelCoords - 像素坐标集合（可选）
     * @returns {Object} Block 对象
     */
    createBlock(source, region, index = 0, pixelCoords = null) {
        const baseName = source.name ? source.name.replace(/\.[^.]+$/, '') : 'sprite';

        return {
            id: `block_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            index: index,
            name: `${baseName}_${String(index + 1).padStart(2, '0')}`,

            // 来源信息
            sourceImage: source.image,
            sourceId: source.id,

            // 检测到的区域
            region: { ...region },

            // 像素坐标集合（用于精确裁剪）
            pixelCoords: pixelCoords,

            // 对齐偏移（后续计算）
            pivot: null,

            // 缓存的裁剪图像
            croppedCanvas: null,

            // 元数据
            metadata: {
                createdAt: Date.now()
            }
        };
    },

    /**
     * 批量创建块
     * @param {Object} source - 源图对象
     * @param {Array} regions - 区域数组
     * @returns {Array} Block 数组
     */
    createBlocks(source, regions) {
        return regions.map((region, index) => this.createBlock(source, region, index, region.pixelCoords || null));
    },

    /**
     * 获取块列表信息（用于调试）
     * @returns {Object}
     */
    getInfo() {
        const validBlocks = this.getValidBlocks();
        const maxSize = this.getMaxSize();

        return {
            total: this._blocks.length,
            valid: validBlocks.length,
            maxSize: maxSize,
            blocks: this._blocks.map(b => ({
                id: b.id,
                name: b.name,
                region: b.region
            }))
        };
    }
};

// 导出（全局模式）
if (typeof window !== 'undefined') {
    window.BlockManager = BlockManager;
}
