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
  const LISTS_STORAGE_KEY = 'wishlist_lists_data';

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
   * Extract the current wishlist name and ID from the page
   */
  function getWishlistInfo() {
    // Get list name from the page title/heading
    let listName = 'Unnamed List';
    const titleEl = document.querySelector('#profile-list-name');
    if (titleEl) {
      listName = titleEl.textContent.trim();
    } else {
      const h1 = document.querySelector('h1.a-text-bold, span#listName');
      if (h1) listName = h1.textContent.trim();
    }

    // Get list ID from URL
    let listId = '';
    const urlMatch = window.location.pathname.match(/\/hz\/wishlist\/ls\/([A-Z0-9]+)/i);
    if (urlMatch) {
      listId = urlMatch[1];
    } else {
      // Try from a data attribute
      const addToCartEl = document.querySelector('span[data-action="add-to-cart"]');
      if (addToCartEl) {
        try {
          const data = JSON.parse(addToCartEl.getAttribute('data-add-to-cart'));
          listId = data.listID || '';
        } catch (e) { /* ignore */ }
      }
    }

    return { listName, listId };
  }

  /**
   * Extract price from an item element.
   * Tries multiple selectors for robustness.
   */
  function extractItemPrice(itemEl) {
    // Method 1: data-add-to-cart JSON attribute (most reliable)
    const addToCartSpan = itemEl.querySelector('span[data-action="add-to-cart"]');
    if (addToCartSpan) {
      try {
        const data = JSON.parse(addToCartSpan.getAttribute('data-add-to-cart'));
        if (data.price) {
          return parseFloat(data.price);
        }
      } catch (e) { /* fallback to DOM scraping */ }
    }

    // Method 2: span.a-offscreen inside price section
    const offscreen = itemEl.querySelector('.price-section span.a-offscreen');
    if (offscreen) {
      const text = offscreen.textContent.trim();
      const num = text.replace(/[^\d.]/g, '');
      if (num) return parseFloat(num);
    }

    // Method 3: span.a-price-whole
    const whole = itemEl.querySelector('span.a-price-whole');
    if (whole) {
      // Get text content but exclude child elements' text
      let wholeText = '';
      for (const node of whole.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          wholeText += node.textContent;
        }
      }
      wholeText = wholeText.replace(/[^\d]/g, '');

      const fraction = itemEl.querySelector('span.a-price-fraction');
      const fractionText = fraction ? fraction.textContent.trim() : '00';

      if (wholeText) return parseFloat(wholeText + '.' + fractionText);
    }

    return 0;
  }

  /**
   * Extract item name from an item element
   */
  function extractItemName(itemEl) {
    const nameLink = itemEl.querySelector('a[id^="itemName_"]');
    if (nameLink) {
      return nameLink.getAttribute('title') || nameLink.textContent.trim();
    }
    const h2 = itemEl.querySelector('h2 a');
    if (h2) {
      return h2.getAttribute('title') || h2.textContent.trim();
    }
    return 'Unknown Item';
  }

  /**
   * Get all items with their prices
   */
  function getItemsWithPrices() {
    const items = document.querySelectorAll(CONFIG.ITEM_SELECTOR);
    const result = [];

    items.forEach((item) => {
      const itemId = item.getAttribute('data-itemid');
      const name = extractItemName(item);
      const price = extractItemPrice(item);
      const hasAddToCart = !!item.querySelector(CONFIG.ADD_TO_CART_SELECTOR);

      result.push({
        itemId,
        name,
        price,
        hasAddToCart
      });
    });

    return result;
  }

  /**
   * Detect currency symbol from page
   */
  function detectCurrency() {
    const symbolEl = document.querySelector('span.a-price-symbol');
    if (symbolEl) return symbolEl.textContent.trim();

    const offscreen = document.querySelector('.price-section span.a-offscreen');
    if (offscreen) {
      const text = offscreen.textContent.trim();
      const match = text.match(/^([^\d\s]+)/);
      if (match) return match[1];
    }

    // Default based on domain
    if (window.location.hostname.includes('amazon.in')) return '₹';
    if (window.location.hostname.includes('amazon.com')) return '$';
    return '₹';
  }

  /**
   * Save current wishlist data to storage for the multi-list detail page
   */
  async function saveListData() {
    const { listName, listId } = getWishlistInfo();
    if (!listId) return;

    const items = getItemsWithPrices();
    const totalPrice = items.reduce((sum, item) => sum + item.price, 0);
    const currency = detectCurrency();

    const listData = {
      listId,
      listName,
      itemCount: items.length,
      totalPrice,
      currency,
      items: items.map(i => ({ name: i.name, price: i.price })),
      lastUpdated: Date.now(),
      url: window.location.href
    };

    // Get existing lists data
    const result = await chrome.storage.local.get(LISTS_STORAGE_KEY);
    const allLists = result[LISTS_STORAGE_KEY] || {};

    // Add/update this list
    allLists[listId] = listData;

    await chrome.storage.local.set({ [LISTS_STORAGE_KEY]: allLists });
    console.log(`Saved list data for "${listName}": ${items.length} items, total ${currency}${totalPrice.toFixed(2)}`);
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
   * Get current status including price info
   */
  function getStatus() {
    const items = getItemsWithPrices();
    const addableItems = items.filter(i => i.hasAddToCart);
    const totalPrice = items.reduce((sum, item) => sum + item.price, 0);
    const currency = detectCurrency();
    const { listName, listId } = getWishlistInfo();

    return {
      isWishlistPage: true,
      itemCount: addableItems.length,
      allItemCount: items.length,
      isProcessing: isProcessing,
      processed: processedCount,
      total: totalItems,
      totalPrice: totalPrice,
      currency: currency,
      listName: listName,
      listId: listId
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
    } else if (request.action === 'SAVE_LIST_DATA') {
      saveListData().then(() => sendResponse({ success: true }));
      return true; // Keep channel open for async
    }
    return true;
  });

  // ── Auto-refresh: watch for new items loaded via infinite scroll ──
  let lastKnownItemCount = 0;
  let refreshDebounceTimer = null;

  function onItemsChanged() {
    const currentCount = document.querySelectorAll(CONFIG.ITEM_SELECTOR).length;
    if (currentCount !== lastKnownItemCount) {
      lastKnownItemCount = currentCount;
      console.log(`Item count changed to ${currentCount}, auto-saving...`);

      // Debounce: wait 500ms of no changes before saving
      clearTimeout(refreshDebounceTimer);
      refreshDebounceTimer = setTimeout(async () => {
        await saveListData();

        // Notify popup with fresh status
        try {
          chrome.runtime.sendMessage({
            type: 'LIVE_UPDATE',
            ...getStatus()
          });
        } catch (e) { /* popup may not be open */ }
      }, 500);
    }
  }

  // MutationObserver on the wishlist container
  function startObserver() {
    // The wishlist items live inside a ul or the endOfListMarker parent
    const container = document.querySelector('#g-items, [id^="g-items"]')
      || document.querySelector('ul.a-unordered-list')
      || document.body;

    const observer = new MutationObserver(() => {
      onItemsChanged();
    });

    observer.observe(container, { childList: true, subtree: true });
    console.log('MutationObserver started on', container.tagName || 'body');
  }

  // Also listen for scroll to catch edge cases
  let scrollDebounceTimer = null;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = setTimeout(() => {
      onItemsChanged();
    }, 800);
  }, { passive: true });

  // Initialize - check for saved state
  console.log('Amazon Wishlist to Cart extension loaded');

  // Auto-save list data whenever a wishlist page loads
  saveListData().then(() => {
    lastKnownItemCount = document.querySelectorAll(CONFIG.ITEM_SELECTOR).length;
  });

  // Start observing for new items
  startObserver();

  // Check if we need to resume after page refresh
  loadState().then(hasState => {
    if (hasState) {
      console.log('Found saved state, resuming automation...');
      // Resume processing
      processAllItems(true);
    }
  });

})();
