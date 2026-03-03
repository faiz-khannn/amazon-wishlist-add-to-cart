// Amazon Wishlist to Cart - Detail Page Script
// Shows all accumulated wishlists with prices

(function () {
  'use strict';

  const LISTS_STORAGE_KEY = 'wishlist_lists_data';

  // DOM elements
  const grandTotalSection = document.getElementById('grand-total-section');
  const grandTotalValue = document.getElementById('grand-total-value');
  const totalListsCount = document.getElementById('total-lists-count');
  const totalItemsCount = document.getElementById('total-items-count');
  const loadingSection = document.getElementById('loading-section');
  const emptySection = document.getElementById('empty-section');
  const listsSection = document.getElementById('lists-section');
  const listsGrid = document.getElementById('lists-grid');
  const actionsSection = document.getElementById('actions-section');
  const clearAllBtn = document.getElementById('clear-all-btn');

  /**
   * Format price with currency
   */
  function formatPrice(price, currency) {
    currency = currency || '₹';
    return currency + price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Format relative time
   */
  function timeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 2592000) return Math.floor(seconds / 86400) + 'd ago';

    const date = new Date(timestamp);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /**
   * Create a list card element
   */
  function createListCard(listData) {
    const card = document.createElement('div');
    card.className = 'list-card';
    card.setAttribute('data-list-id', listData.listId);

    const currency = listData.currency || '₹';
    const itemCount = listData.itemCount || 0;
    const totalPrice = listData.totalPrice || 0;
    const items = listData.items || [];
    const lastUpdated = listData.lastUpdated ? timeAgo(listData.lastUpdated) : 'Unknown';

    card.innerHTML = `
      <div class="list-card-header">
        <div class="list-card-name">${escapeHtml(listData.listName || 'Unnamed List')}</div>
        <span class="list-card-badge">${itemCount} item${itemCount !== 1 ? 's' : ''}</span>
      </div>

      <div class="list-card-stats">
        <div class="stat-block">
          <div class="stat-label">Items</div>
          <div class="stat-value">${itemCount}</div>
        </div>
        <div class="stat-block">
          <div class="stat-label">Total Value</div>
          <div class="stat-value price">${formatPrice(totalPrice, currency)}</div>
        </div>
      </div>

      <div class="list-card-footer">
        <span class="list-card-updated">Updated ${lastUpdated}</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${listData.url ? `<a href="${escapeHtml(listData.url)}" target="_blank" class="list-card-link">Open List →</a>` : ''}
          <button class="list-card-delete" data-list-id="${escapeHtml(listData.listId)}" title="Remove this list">🗑️</button>
        </div>
      </div>

      ${items.length > 0 ? `
        <button class="list-card-items-toggle" data-list-id="${escapeHtml(listData.listId)}">
          Show ${items.length} item${items.length !== 1 ? 's' : ''} ▼
        </button>
        <div class="list-card-items" id="items-${escapeHtml(listData.listId)}">
          ${items.map(item => `
            <div class="item-row">
              <span class="item-name" title="${escapeHtml(item.name)}">${escapeHtml(truncate(item.name, 50))}</span>
              <span class="item-price ${item.price === 0 ? 'no-price' : ''}">${item.price > 0 ? formatPrice(item.price, currency) : 'N/A'}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;

    // Toggle items expand/collapse
    const toggleBtn = card.querySelector('.list-card-items-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const itemsContainer = card.querySelector('.list-card-items');
        const isExpanded = itemsContainer.classList.contains('expanded');
        itemsContainer.classList.toggle('expanded');
        toggleBtn.textContent = isExpanded
          ? `Show ${items.length} item${items.length !== 1 ? 's' : ''} ▼`
          : `Hide items ▲`;
      });
    }

    // Delete this list
    const deleteBtn = card.querySelector('.list-card-delete');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        const listId = deleteBtn.getAttribute('data-list-id');
        await deleteList(listId);
        loadLists();
      });
    }

    return card;
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (match) => {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;' };
      return map[match];
    });
  }

  /**
   * Truncate text
   */
  function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '…' : str;
  }

  /**
   * Delete a specific list from storage
   */
  async function deleteList(listId) {
    const result = await chrome.storage.local.get(LISTS_STORAGE_KEY);
    const allLists = result[LISTS_STORAGE_KEY] || {};
    delete allLists[listId];
    await chrome.storage.local.set({ [LISTS_STORAGE_KEY]: allLists });
  }

  /**
   * Clear all list data
   */
  async function clearAllLists() {
    if (confirm('Are you sure you want to clear all saved wishlist data? This cannot be undone.')) {
      await chrome.storage.local.remove(LISTS_STORAGE_KEY);
      loadLists();
    }
  }

  /**
   * Load and render all lists
   */
  async function loadLists() {
    loadingSection.classList.remove('hidden');
    emptySection.classList.add('hidden');
    listsSection.classList.add('hidden');
    grandTotalSection.classList.add('hidden');
    actionsSection.classList.add('hidden');

    // Small delay for UX
    await new Promise(resolve => setTimeout(resolve, 300));

    const result = await chrome.storage.local.get(LISTS_STORAGE_KEY);
    const allLists = result[LISTS_STORAGE_KEY] || {};
    const listEntries = Object.values(allLists);

    loadingSection.classList.add('hidden');

    if (listEntries.length === 0) {
      emptySection.classList.remove('hidden');
      return;
    }

    // Sort by lastUpdated (most recent first)
    listEntries.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));

    // Calculate grand totals
    let grandTotal = 0;
    let totalItemCount = 0;
    let defaultCurrency = '₹';

    listEntries.forEach(list => {
      grandTotal += list.totalPrice || 0;
      totalItemCount += list.itemCount || 0;
      if (list.currency) defaultCurrency = list.currency;
    });

    // Render grand total
    grandTotalValue.textContent = formatPrice(grandTotal, defaultCurrency);
    totalListsCount.textContent = listEntries.length;
    totalItemsCount.textContent = totalItemCount;
    grandTotalSection.classList.remove('hidden');

    // Render list cards
    listsGrid.innerHTML = '';
    listEntries.forEach(list => {
      listsGrid.appendChild(createListCard(list));
    });

    listsSection.classList.remove('hidden');
    actionsSection.classList.remove('hidden');
  }

  // Event listeners
  clearAllBtn.addEventListener('click', clearAllLists);

  // Refresh button
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.classList.add('spinning');
      refreshBtn.textContent = '⏳ Refreshing...';
      loadLists().then(() => {
        refreshBtn.classList.remove('spinning');
        refreshBtn.textContent = '🔄 Refresh';
      });
    });
  }

  // Auto-refresh when storage changes (e.g. user is scrolling a list in another tab)
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes[LISTS_STORAGE_KEY]) {
      loadLists();
    }
  });

  // Initialize
  loadLists();

})();
