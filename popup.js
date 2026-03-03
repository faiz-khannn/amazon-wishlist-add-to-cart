// Amazon Wishlist to Cart - Popup Script
// Handles UI updates and communication with content script

(function () {
    'use strict';

    // DOM elements
    const elements = {
        startButton: document.getElementById('start-button'),
        notWishlist: document.getElementById('not-wishlist'),
        ready: document.getElementById('ready'),
        processing: document.getElementById('processing'),
        complete: document.getElementById('complete'),
        noItems: document.getElementById('no-items'),
        itemCount: document.getElementById('item-count'),
        currentItem: document.getElementById('current-item'),
        totalItems: document.getElementById('total-items'),
        processedCount: document.getElementById('processed-count'),
        failedCount: document.getElementById('failed-count'),
        failedMessage: document.getElementById('failed-message'),
        progressFill: document.getElementById('progress-fill'),
        controlButtons: document.getElementById('control-buttons'),
        pauseButton: document.getElementById('pause-button'),
        resumeButton: document.getElementById('resume-button'),
        stopButton: document.getElementById('stop-button'),
        priceInfo: document.getElementById('price-info'),
        totalPrice: document.getElementById('total-price'),
        listName: document.getElementById('list-name'),
        detailButton: document.getElementById('detail-button')
    };

    /**
     * Hide all status messages
     */
    function hideAllMessages() {
        elements.notWishlist.classList.add('hidden');
        elements.ready.classList.add('hidden');
        elements.processing.classList.add('hidden');
        elements.complete.classList.add('hidden');
        elements.noItems.classList.add('hidden');
    }

    /**
     * Show specific status message
     */
    function showMessage(messageElement) {
        hideAllMessages();
        messageElement.classList.remove('hidden');
    }

    /**
     * Update progress bar
     */
    function updateProgress(current, total) {
        const percentage = total > 0 ? (current / total) * 100 : 0;
        elements.progressFill.style.width = `${percentage}%`;
        elements.currentItem.textContent = current;
        elements.totalItems.textContent = total;
    }

    /**
     * Format price with currency
     */
    function formatPrice(price, currency) {
        currency = currency || '₹';
        return currency + price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    // Track if currently processing to prevent message conflicts
    let isCurrentlyProcessing = false;

    /**
   * Inject content script if not already loaded
   */
    async function ensureContentScript(tabId) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
            // Wait a bit for the script to initialize
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            // Script might already be injected, which is fine
            console.log('Content script injection:', error.message);
        }
    }

    /**
     * Check if current tab is on Amazon wishlist page
     */
    async function checkWishlistPage() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab || !tab.url) {
                showMessage(elements.notWishlist);
                elements.startButton.disabled = true;
                return;
            }

            const isWishlistPage = tab.url.includes('amazon.') && tab.url.includes('/hz/wishlist/');

            if (!isWishlistPage) {
                showMessage(elements.notWishlist);
                elements.startButton.disabled = true;
                return;
            }

            // Ensure content script is loaded (fixes issue with already-open tabs)
            await ensureContentScript(tab.id);

            // Get status from content script
            chrome.tabs.sendMessage(tab.id, { action: 'GET_STATUS' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('Error:', chrome.runtime.lastError);
                    showMessage(elements.notWishlist);
                    elements.startButton.disabled = true;
                    return;
                }

                if (response && response.itemCount > 0) {
                    elements.itemCount.textContent = response.itemCount;
                    showMessage(elements.ready);
                    elements.startButton.disabled = false;

                    // Show price info
                    if (response.totalPrice > 0) {
                        elements.totalPrice.textContent = formatPrice(response.totalPrice, response.currency);
                        elements.priceInfo.classList.remove('hidden');
                    } else {
                        elements.priceInfo.classList.add('hidden');
                    }

                    // Show list name
                    if (response.listName) {
                        elements.listName.textContent = response.listName;
                    }
                } else if (response && response.itemCount === 0) {
                    showMessage(elements.noItems);
                    elements.startButton.disabled = true;
                } else {
                    showMessage(elements.notWishlist);
                    elements.startButton.disabled = true;
                }
            });
        } catch (error) {
            console.error('Error checking wishlist page:', error);
            showMessage(elements.notWishlist);
            elements.startButton.disabled = true;
        }
    }

    /**
     * Start the add to cart process
     */
    async function startProcess() {
        try {
            elements.startButton.disabled = true;
            elements.controlButtons.classList.remove('hidden');
            elements.pauseButton.classList.remove('hidden');
            elements.resumeButton.classList.add('hidden');
            showMessage(elements.processing);
            updateProgress(0, 0);

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.sendMessage(tab.id, { action: 'START_PROCESS' });
        } catch (error) {
            console.error('Error starting process:', error);
            showMessage(elements.ready);
            elements.startButton.disabled = false;
            elements.controlButtons.classList.add('hidden');
        }
    }

    /**
     * Pause the process
     */
    async function pauseProcess() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.sendMessage(tab.id, { action: 'PAUSE_PROCESS' });
            elements.pauseButton.classList.add('hidden');
            elements.resumeButton.classList.remove('hidden');
        } catch (error) {
            console.error('Error pausing process:', error);
        }
    }

    /**
     * Resume the process
     */
    async function resumeProcess() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.sendMessage(tab.id, { action: 'RESUME_PROCESS' });
            elements.pauseButton.classList.remove('hidden');
            elements.resumeButton.classList.add('hidden');
        } catch (error) {
            console.error('Error resuming process:', error);
        }
    }

    /**
     * Stop the process
     */
    async function stopProcess() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.sendMessage(tab.id, { action: 'STOP_PROCESS' });
            elements.controlButtons.classList.add('hidden');
        } catch (error) {
            console.error('Error stopping process:', error);
        }
    }

    /**
     * Open the detail page in a new tab
     */
    function openDetailPage() {
        chrome.tabs.create({ url: chrome.runtime.getURL('detail.html') });
    }

    /**
     * Handle messages from content script
     */
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch (request.type) {
            case 'PROCESS_STARTED':
                isCurrentlyProcessing = true;
                showMessage(elements.processing);
                updateProgress(request.processed || 0, request.total);
                elements.controlButtons.classList.remove('hidden');
                elements.pauseButton.classList.remove('hidden');
                elements.resumeButton.classList.add('hidden');
                break;

            case 'PROGRESS_UPDATE':
                if (isCurrentlyProcessing) {
                    updateProgress(request.processed, request.total);
                }
                break;

            case 'PROCESS_PAUSED':
                elements.pauseButton.classList.add('hidden');
                elements.resumeButton.classList.remove('hidden');
                console.log('Process paused');
                break;

            case 'PROCESS_RESUMED':
                elements.pauseButton.classList.remove('hidden');
                elements.resumeButton.classList.add('hidden');
                console.log('Process resumed');
                break;

            case 'PROCESS_STOPPED':
                isCurrentlyProcessing = false;
                elements.processedCount.textContent = request.processed;
                showMessage(elements.complete);
                elements.startButton.disabled = false;
                elements.controlButtons.classList.add('hidden');
                break;

            case 'PROCESS_COMPLETE':
                isCurrentlyProcessing = false;
                elements.processedCount.textContent = request.processed;
                if (request.failed > 0) {
                    elements.failedCount.textContent = request.failed;
                    elements.failedMessage.classList.remove('hidden');
                }
                showMessage(elements.complete);
                elements.startButton.disabled = false;
                elements.controlButtons.classList.add('hidden');
                break;

            case 'NO_ITEMS_FOUND':
                isCurrentlyProcessing = false;
                showMessage(elements.noItems);
                elements.startButton.disabled = true;
                break;

            case 'LIVE_UPDATE':
                // Auto-refresh from content script (new items detected from scrolling)
                if (!isCurrentlyProcessing) {
                    elements.itemCount.textContent = request.itemCount;
                    showMessage(elements.ready);
                    elements.startButton.disabled = request.itemCount === 0;

                    if (request.totalPrice > 0) {
                        elements.totalPrice.textContent = formatPrice(request.totalPrice, request.currency);
                        elements.priceInfo.classList.remove('hidden');
                    }
                    if (request.listName) {
                        elements.listName.textContent = request.listName;
                    }
                }
                break;
        }
    });

    // Event listeners
    elements.startButton.addEventListener('click', startProcess);
    elements.pauseButton.addEventListener('click', pauseProcess);
    elements.resumeButton.addEventListener('click', resumeProcess);
    elements.stopButton.addEventListener('click', stopProcess);
    elements.detailButton.addEventListener('click', openDetailPage);

    // Add refresh button listener
    const refreshButton = document.getElementById('refresh-button');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            checkWishlistPage();
        });
    }

    // Initialize on popup open
    checkWishlistPage();

    // ── Periodic auto-refresh while popup is open (every 3 seconds) ──
    const autoRefreshInterval = setInterval(() => {
        if (!isCurrentlyProcessing) {
            checkWishlistPage();
        }
    }, 3000);

    // Clean up interval when popup closes
    window.addEventListener('unload', () => {
        clearInterval(autoRefreshInterval);
    });

})();
