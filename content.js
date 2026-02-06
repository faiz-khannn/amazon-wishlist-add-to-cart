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
  function clickButton(buttonData) {
    return new Promise((resolve) => {
      try {
        console.log(`Clicking Add to Cart for item ${buttonData.index}/${totalItems} (ID: ${buttonData.itemId})`);
        buttonData.button.click();
        processedCount++;

        // Send progress update to popup
        chrome.runtime.sendMessage({
          type: 'PROGRESS_UPDATE',
          processed: processedCount,
          total: totalItems,
          currentItem: buttonData.index,
          isPaused: isPaused
        });

        const delay = getRandomDelay();
        setTimeout(resolve, delay);
      } catch (error) {
        console.error(`Error clicking button for item ${buttonData.itemId}:`, error);
        failedItems.push(buttonData.itemId);
        resolve();
      }
    });
  }

  /**
   * Process all Add to Cart buttons sequentially
   */
  async function processAllItems() {
    if (isProcessing) {
      console.log('Already processing items...');
      return;
    }

    isProcessing = true;
    isPaused = false;
    isStopped = false;
    processedCount = 0;
    failedItems = [];
    currentButtonIndex = 0;

    const buttons = findAddToCartButtons();
    buttonQueue = buttons;
    totalItems = buttons.length;

    if (totalItems === 0) {
      chrome.runtime.sendMessage({
        type: 'NO_ITEMS_FOUND'
      });
      isProcessing = false;
      return;
    }

    console.log(`Found ${totalItems} items to add to cart`);

    chrome.runtime.sendMessage({
      type: 'PROCESS_STARTED',
      total: totalItems
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
  function pauseProcess() {
    if (isProcessing && !isPaused) {
      isPaused = true;
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
  function resumeProcess() {
    if (isProcessing && isPaused) {
      isPaused = false;
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
  function stopProcess() {
    if (isProcessing) {
      isStopped = true;
      isPaused = false;
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

  // Initialize - send ready message
  console.log('Amazon Wishlist to Cart extension loaded');
  chrome.runtime.sendMessage({
    type: 'CONTENT_SCRIPT_READY',
    itemCount: findAddToCartButtons().length
  });

})();
