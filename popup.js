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
        progressFill: document.getElementById('progress-fill')
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
            showMessage(elements.processing);
            updateProgress(0, 0);

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            chrome.tabs.sendMessage(tab.id, { action: 'START_PROCESS' });
        } catch (error) {
            console.error('Error starting process:', error);
            showMessage(elements.ready);
            elements.startButton.disabled = false;
        }
    }

    /**
     * Handle messages from content script
     */
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        switch (request.type) {
            case 'PROCESS_STARTED':
                showMessage(elements.processing);
                updateProgress(0, request.total);
                break;

            case 'PROGRESS_UPDATE':
                updateProgress(request.processed, request.total);
                break;

            case 'PROCESS_COMPLETE':
                elements.processedCount.textContent = request.processed;
                if (request.failed > 0) {
                    elements.failedCount.textContent = request.failed;
                    elements.failedMessage.classList.remove('hidden');
                }
                showMessage(elements.complete);
                elements.startButton.disabled = false;
                break;

            case 'NO_ITEMS_FOUND':
                showMessage(elements.noItems);
                elements.startButton.disabled = true;
                break;

            case 'CONTENT_SCRIPT_READY':
                // Content script is ready, refresh status
                checkWishlistPage();
                break;
        }
    });

    // Event listeners
    elements.startButton.addEventListener('click', startProcess);

    // Add refresh button listener
    const refreshButton = document.getElementById('refresh-button');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            checkWishlistPage();
        });
    }

    // Initialize on popup open
    checkWishlistPage();

})();
