/**
 * Magic Pixel - 应用入口
 *
 * 图片切割工具主入口文件
 * 负责初始化各模块并协调它们之间的交互
 */

const App = {
    /**
     * 初始化应用
     */
    init() {
        console.log('Magic Pixel - 初始化中...');

        // 初始化 UI 控制器
        UIController.init();

        // 初始化图片加载器
        ImageLoader.init('uploadZone', 'fileInput');

        // 绑定模块间事件
        this._bindModuleEvents();

        console.log('Magic Pixel - 初始化完成');
    },

    /**
     * 绑定模块间事件
     */
    _bindModuleEvents() {
        // 图片加载完成
        ImageLoader.on('loaded', (image, info) => {
            console.log('图片已加载:', info);

            // 设置源图片
            ImageProcessor.setSourceImage(image);

            // 更新 UI
            UIController.setState('imageLoaded');
            UIController.showImageInfo(info);
            UIController.showPreview(image);
            UIController.hideGridOverlay();

            // 重置切割结果
            DOM.hide(DOM.$('#piecesSection'));
        });

        // 图片分析完成（智能检测网格）
        ImageLoader.on('analyzed', (detection) => {
            console.log('网格检测结果:', detection);
            UIController.setAutoDetectedGrid(detection);
        });

        // 图片加载错误
        ImageLoader.on('error', (message) => {
            console.error('图片加载错误:', message);
            UIController.showToast(message, 'error');
        });
    }
};

// DOM 加载完成后初始化应用
document.addEventListener('DOMContentLoaded', () => {
    // 更新主标题
    if (typeof APP_CONFIG !== 'undefined') {
        document.querySelectorAll('[data-i18n="appName"]').forEach(el => {
            el.textContent = APP_CONFIG.name;
        });
    }
    App.init();
});
