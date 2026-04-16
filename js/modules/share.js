/**
 * Magic Pixel - Share Module
 * 分享功能模块
 */

const ShareModule = {
    // DOM elements
    _elements: {},

    // Share configuration
    _config: {
        url: '',
        title: 'Magic Pixel - 像素魔法工具箱',
        description: '简单、高效的在线图片处理工具集'
    },

    // Supported platforms
    _platforms: {
        weibo: {
            name: '微博',
            shareUrl: 'https://service.weibo.com/share/share.php',
            params: {
                url: 'url',
                title: 'title'
            }
        },
        twitter: {
            name: 'Twitter',
            shareUrl: 'https://twitter.com/intent/tweet',
            params: {
                url: 'url',
                text: 'text'
            }
        },
        wechat: {
            name: '微信',
            useQRCode: true
        }
    },

    /**
     * Initialize share module
     */
    init() {
        this._setConfig();
        this._cacheElements();
        this._bindEvents();
    },

    /**
     * Set share configuration
     */
    _setConfig() {
        this._config.url = window.location.href;
    },

    /**
     * Cache DOM elements
     */
    _cacheElements() {
        this._elements = {
            shareBtn: document.getElementById('shareBtn'),
            shareModal: document.getElementById('shareModal'),
            shareModalClose: document.getElementById('shareModalClose'),
            shareUrlInput: document.getElementById('shareUrlInput'),
            copyLinkBtn: document.getElementById('copyLinkBtn'),
            platformBtns: document.querySelectorAll('.share-platform')
        };
    },

    /**
     * Bind events
     */
    _bindEvents() {
        // Share button click
        if (this._elements.shareBtn) {
            this._elements.shareBtn.addEventListener('click', () => this.openModal());
        }

        // Close modal
        if (this._elements.shareModalClose) {
            this._elements.shareModalClose.addEventListener('click', () => this.closeModal());
        }

        // Close modal on backdrop click
        if (this._elements.shareModal) {
            this._elements.shareModal.addEventListener('click', (e) => {
                if (e.target === this._elements.shareModal) {
                    this.closeModal();
                }
            });
        }

        // Copy link button
        if (this._elements.copyLinkBtn) {
            this._elements.copyLinkBtn.addEventListener('click', () => this.copyLink());
        }

        // Platform buttons
        this._elements.platformBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const platform = btn.dataset.platform;
                this.shareTo(platform);
            });
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isModalOpen()) {
                this.closeModal();
            }
        });
    },

    /**
     * Open share modal
     */
    openModal() {
        // Update URL input with current URL
        if (this._elements.shareUrlInput) {
            this._elements.shareUrlInput.value = this._config.url;
        }

        // Show modal
        this._elements.shareModal.classList.add('share-modal--active');
        document.body.style.overflow = 'hidden';
    },

    /**
     * Close share modal
     */
    closeModal() {
        this._elements.shareModal.classList.remove('share-modal--active');
        document.body.style.overflow = '';
    },

    /**
     * Check if modal is open
     */
    isModalOpen() {
        return this._elements.shareModal &&
               this._elements.shareModal.classList.contains('share-modal--active');
    },

    /**
     * Copy link to clipboard
     */
    async copyLink() {
        try {
            await navigator.clipboard.writeText(this._config.url);

            // Visual feedback
            const btn = this._elements.copyLinkBtn;
            const originalText = btn.textContent;
            btn.textContent = '已复制!';
            btn.classList.add('share-copy-link__btn--copied');

            // Reset after delay
            setTimeout(() => {
                btn.textContent = originalText;
                btn.classList.remove('share-copy-link__btn--copied');
            }, 2000);

        } catch (err) {
            // Fallback for older browsers
            this._fallbackCopy();
        }
    },

    /**
     * Fallback copy method
     */
    _fallbackCopy() {
        const input = this._elements.shareUrlInput;
        input.select();
        input.setSelectionRange(0, 99999);

        try {
            document.execCommand('copy');

            const btn = this._elements.copyLinkBtn;
            const originalText = btn.textContent;
            btn.textContent = '已复制!';
            btn.classList.add('share-copy-link__btn--copied');

            setTimeout(() => {
                btn.textContent = originalText;
                btn.classList.remove('share-copy-link__btn--copied');
            }, 2000);

        } catch (err) {
            alert('复制失败，请手动复制: ' + this._config.url);
        }
    },

    /**
     * Share to specific platform
     */
    shareTo(platform) {
        const config = this._platforms[platform];
        if (!config) return;

        if (config.useQRCode) {
            // WeChat: Show QR code
            this._showWeChatQRCode();
        } else {
            // Other platforms: Open share URL
            this._openShareWindow(config);
        }
    },

    /**
     * Open share window
     */
    _openShareWindow(platformConfig) {
        const params = new URLSearchParams();

        // Map parameters
        if (platformConfig.params.url) {
            params.set(platformConfig.params.url, this._config.url);
        }
        if (platformConfig.params.title || platformConfig.params.text) {
            const key = platformConfig.params.title || platformConfig.params.text;
            params.set(key, `${this._config.title} - ${this._config.description}`);
        }

        const shareUrl = `${platformConfig.shareUrl}?${params.toString()}`;

        // Open in popup window
        window.open(
            shareUrl,
            'share',
            'width=600,height=500,scrollbars=yes,resizable=yes'
        );
    },

    /**
     * Show WeChat QR code
     */
    _showWeChatQRCode() {
        // Create QR code overlay
        const overlay = document.createElement('div');
        overlay.className = 'share-modal share-modal--active';
        overlay.id = 'wechatQRModal';

        const content = document.createElement('div');
        content.className = 'share-modal__content';

        content.innerHTML = `
            <div class="share-modal__header">
                <h3>分享到微信</h3>
                <button class="share-modal__close" id="wechatQRClose">&times;</button>
            </div>
            <div class="share-qrcode">
                <p class="share-qrcode__title">扫描二维码分享</p>
                <div class="share-qrcode__image" id="qrcodeContainer"></div>
                <p class="share-qrcode__tip">打开微信扫一扫，分享给好友</p>
            </div>
        `;

        overlay.appendChild(content);
        document.body.appendChild(overlay);

        // Generate QR code
        this._generateQRCode(this._config.url);

        // Close button
        const closeBtn = document.getElementById('wechatQRClose');
        closeBtn.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    },

    /**
     * Generate QR code using API
     */
    _generateQRCode(url) {
        const container = document.getElementById('qrcodeContainer');
        if (!container) return;

        // Use QR code API
        const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`;
        const img = document.createElement('img');
        img.src = qrApiUrl;
        img.alt = 'QR Code';
        img.style.cssText = 'width: 180px; height: 180px;';
        container.appendChild(img);
    },

    /**
     * Update share URL (for dynamic pages)
     */
    setUrl(url) {
        this._config.url = url;
        if (this._elements.shareUrlInput) {
            this._elements.shareUrlInput.value = url;
        }
    },

    /**
     * Update share title
     */
    setTitle(title) {
        this._config.title = title;
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ShareModule.init());
} else {
    ShareModule.init();
}

/**
 * Favorite Module
 * 收藏功能模块 - 提示用户手动添加浏览器书签
 */
const FavoriteModule = {
    _favoriteBtn: null,

    init() {
        this._favoriteBtn = document.getElementById('favoriteBtn');
        if (this._favoriteBtn) {
            this._favoriteBtn.addEventListener('click', () => this.showTip());
        }
    },

    showTip() {
        // 检测操作系统，显示相应的快捷键提示
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const shortcut = isMac ? 'Cmd + D' : 'Ctrl + D';

        this._showToast(`请按 ${shortcut} 添加到浏览器收藏`);
    },

    _showToast(message) {
        // 复用页面已有的 toast 功能
        const toastContainer = document.getElementById('toastContainer');
        if (toastContainer) {
            const toast = document.createElement('div');
            toast.className = 'toast toast--success';
            toast.innerHTML = `<span class="toast__icon">💡</span><span class="toast__message">${message}</span>`;
            toastContainer.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        } else {
            // 简单提示
            const tip = document.createElement('div');
            tip.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#5BA88F;color:white;padding:8px 16px;border-radius:8px;font-size:14px;z-index:3000;';
            tip.textContent = message;
            document.body.appendChild(tip);
            setTimeout(() => tip.remove(), 3000);
        }
    }
};

// 初始化收藏模块
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FavoriteModule.init());
} else {
    FavoriteModule.init();
}
