// Amazon Wishlist to Cart - Content Script
// This script runs on Amazon wishlist pages and handles the automation

(function () {
  'use strict';

  // Configuration
  const CONFIG = {
    MIN_DELAY: 1000,  // Minimum delay between clicks (1 second)
    MAX_DELAY: 2000,  // Maximum delay between clicks (2 seconds)
    ITEM_SELECTOR: 'li.g-item-sortable',  // Selector for wishlist items
    ADD_TO_CART_SELECTOR: 'span[data-action="add-to-cart"] a',  // Selector for Add to Cart buttons
  };

  // State management
  let isProcessing = false;
  let isPaused = false;
  let isStopped = false;
  let processedCount = 0;
  let totalItems = 0;
  let failedItems = [];
  let currentButtonIndex = 0;
  let buttonQueue = [];
  let processedItemIds = new Set(); // Track which items were already added

  // Storage keys
  const STORAGE_KEY = 'wishlist_automation_state';

  /**
   * Save state to storage
   */
  async function saveState() {
    const state = {
      isProcessing,
      isPaused,
      processedCount,
      totalItems,
      currentButtonIndex,
      processedItemIds: Array.from(processedItemIds),
      failedItems,
      timestamp: Date.now()
    };
    await chrome.storage.local.set({ [STORAGE_KEY]: state });
  }

  /**
   * Load state from storage
   */
  async function loadState() {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const state = result[STORAGE_KEY];

    if (state && state.isProcessing) {
      // Check if state is recent (within 5 minutes)
      const fiveMinutes = 5 * 60 * 1000;
      if (Date.now() - state.timestamp < fiveMinutes) {
        isProcessing = state.isProcessing;
        isPaused = state.isPaused;
        processedCount = state.processedCount;
        totalItems = state.totalItems;
        currentButtonIndex = state.currentButtonIndex;
        processedItemIds = new Set(state.processedItemIds || []);
        failedItems = state.failedItems || [];

        console.log(`Restored state: ${processedCount}/${totalItems} items processed`);
        return true;
      }
    }
    return false;
  }

  /**
   * Clear state from storage
   */
  async function clearState() {
    await chrome.storage.local.remove(STORAGE_KEY);
  }

  /**
   * Get random delay between min and max
   */
  function getRandomDelay() {
    return Math.floor(Math.random() * (CONFIG.MAX_DELAY - CONFIG.MIN_DELAY + 1)) + CONFIG.MIN_DELAY;
  }

  /**
   * Find all Add to Cart buttons on the page
   */
  function findAddToCartButtons() {
    const items = document.querySelectorAll(CONFIG.ITEM_SELECTOR);
    const buttons = [];

    items.forEach((item, index) => {
      const button = item.querySelector(CONFIG.ADD_TO_CART_SELECTOR);
      if (button && button.textContent.trim().includes('Add to Cart')) {
        const itemId = item.getAttribute('data-itemid');
        buttons.push({
          button: button,
          itemId: itemId,
          index: index + 1
        });
      }
    });

    return buttons;
  }

  /**
   * Click a button and wait for the specified delay
   */
  async function clickButton(buttonData) {
    try {
      // Skip if already processed
      if (processedItemIds.has(buttonData.itemId)) {
        console.log(`Skipping already processed item ${buttonData.itemId}`);
        return;
      }

      console.log(`Clicking Add to Cart for item ${buttonData.index}/${totalItems} (ID: ${buttonData.itemId})`);
      buttonData.button.click();
      processedCount++;
      processedItemIds.add(buttonData.itemId);

      // Save state after each item
      await saveState();

      // Send progress update to popup
      chrome.runtime.sendMessage({
        type: 'PROGRESS_UPDATE',
        processed: processedCount,
        total: totalItems,
        currentItem: buttonData.index,
        isPaused: isPaused
      });

      const delay = getRandomDelay();
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error) {
      console.error(`Error clicking button for item ${buttonData.itemId}:`, error);
      failedItems.push(buttonData.itemId);
      await saveState();
    }
  }

  /**
   * Process all Add to Cart buttons sequentially
   */
  async function processAllItems(resume = false) {
    if (isProcessing && !resume) {
      console.log('Already processing items...');
      return;
    }

    if (!resume) {
      // Starting fresh
      isProcessing = true;
      isPaused = false;
      isStopped = false;
      processedCount = 0;
      failedItems = [];
      currentButtonIndex = 0;
      processedItemIds.clear();
    } else {
      // Resuming after page refresh
      console.log('Resuming from saved state...');
      isProcessing = true;
      isStopped = false;
    }

    const buttons = findAddToCartButtons();
    buttonQueue = buttons;

    if (!resume) {
      totalItems = buttons.length;
    }

    if (totalItems === 0) {
      chrome.runtime.sendMessage({
        type: 'NO_ITEMS_FOUND'
      });
      isProcessing = false;
      await clearState();
      return;
    }

    console.log(`Found ${totalItems} items to add to cart`);
    await saveState();

    chrome.runtime.sendMessage({
      type: 'PROCESS_STARTED',
      total: totalItems,
      processed: processedCount
    });

    // Process each button sequentially with pause/stop support
    for (let i = currentButtonIndex; i < buttonQueue.length; i++) {
      // Check if stopped
      if (isStopped) {
        console.log('Process stopped by user');
        chrome.runtime.sendMessage({
          type: 'PROCESS_STOPPED',
          processed: processedCount,
          total: totalItems
        });
        isProcessing = false;
        return;
      }

      // Wait while paused
      while (isPaused && !isStopped) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Check again after pause
      if (isStopped) {
        console.log('Process stopped by user');
        chrome.runtime.sendMessage({
          type: 'PROCESS_STOPPED',
          processed: processedCount,
          total: totalItems
        });
        isProcessing = false;
        return;
      }

      currentButtonIndex = i;
      await clickButton(buttonQueue[i]);
    }

    // Send completion message
    chrome.runtime.sendMessage({
      type: 'PROCESS_COMPLETE',
      processed: processedCount,
      total: totalItems,
      failed: failedItems.length
    });

    isProcessing = false;
    await clearState();
    console.log(`Process complete! Added ${processedCount} items to cart.`);
    if (failedItems.length > 0) {
      console.log(`Failed items: ${failedItems.join(', ')}`);
    }
  }

  /**
   * Get current status
   */
  function getStatus() {
    const buttons = findAddToCartButtons();
    return {
      isWishlistPage: true,
      itemCount: buttons.length,
      isProcessing: isProcessing,
      processed: processedCount,
      total: totalItems
    };
  }

  /**
   * Pause the process
   */
  async function pauseProcess() {
    if (isProcessing && !isPaused) {
      isPaused = true;
      await saveState();
      console.log('Process paused');
      chrome.runtime.sendMessage({
        type: 'PROCESS_PAUSED',
        processed: processedCount,
        total: totalItems
      });
    }
  }

  /**
   * Resume the process
   */
  async function resumeProcess() {
    if (isProcessing && isPaused) {
      isPaused = false;
      await saveState();
      console.log('Process resumed');
      chrome.runtime.sendMessage({
        type: 'PROCESS_RESUMED',
        processed: processedCount,
        total: totalItems
      });
    }
  }

  /**
   * Stop the process
   */
  async function stopProcess() {
    if (isProcessing) {
      isStopped = true;
      isPaused = false;
      await clearState();
      console.log('Process stop requested');
    }
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'START_PROCESS') {
      processAllItems();
      sendResponse({ success: true });
    } else if (request.action === 'PAUSE_PROCESS') {
      pauseProcess();
      sendResponse({ success: true });
    } else if (request.action === 'RESUME_PROCESS') {
      resumeProcess();
      sendResponse({ success: true });
    } else if (request.action === 'STOP_PROCESS') {
      stopProcess();
      sendResponse({ success: true });
    } else if (request.action === 'GET_STATUS') {
      sendResponse(getStatus());
    }
    return true;
  });

  // Initialize - check for saved state
  console.log('Amazon Wishlist to Cart extension loaded');

  // Check if we need to resume after page refresh
  loadState().then(hasState => {
    if (hasState) {
      console.log('Found saved state, resuming automation...');
      // Resume processing
      processAllItems(true);
    }
  });

})();
