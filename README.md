# Amazon Wishlist to Cart - Chrome Extension

A Chrome extension that automates adding all items from your Amazon wishlist to your shopping cart with a single click.

## Features

- ✅ **One-Click Automation**: Add all wishlist items to cart instantly
- 🎯 **Smart Detection**: Automatically detects Amazon wishlist pages
- ⏱️ **Rate Limiting**: Adds items with 1-2 second delays to avoid triggering Amazon's rate limits
- 📊 **Progress Tracking**: Real-time progress indicator showing items being added
- 🎨 **Modern UI**: Clean, intuitive popup interface with visual feedback
- 🛡️ **Error Handling**: Gracefully handles out-of-stock or unavailable items

## Installation

### Install from Source

1. **Download the Extension**
   - Clone or download this repository to your computer
   - Extract the files if downloaded as a ZIP

2. **Open Chrome Extensions Page**
   - Open Google Chrome
   - Navigate to `chrome://extensions/`
   - Or click Menu (⋮) → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension**
   - Click "Load unpacked"
   - Select the `wish_list_to_cart_adder` folder
   - The extension icon should appear in your toolbar

## Usage

1. **Navigate to Your Wishlist**
   - Go to Amazon.in (or Amazon.com)
   - Open any of your wishlists

2. **Open the Extension**
   - Click the extension icon in your Chrome toolbar
   - The popup will show the number of items found

3. **Add Items to Cart**
   - Click the "Add All to Cart" button
   - Watch the progress as items are added
   - Wait for the completion message

## How It Works

The extension uses the following approach:

1. **Detection**: Identifies Amazon wishlist pages using URL patterns
2. **Scanning**: Finds all "Add to Cart" buttons on the current page
3. **Sequential Processing**: Clicks each button one at a time
4. **Delay Management**: Waits 1-2 seconds between clicks to mimic human behavior
5. **Progress Updates**: Sends real-time updates to the popup interface

## Technical Details

### DOM Selectors

The extension uses these selectors to interact with Amazon's wishlist:
- **Wishlist Items**: `li.g-item-sortable`
- **Add to Cart Buttons**: `span[data-action="add-to-cart"] a`

### Permissions

- `activeTab`: Access to the current tab
- `scripting`: Ability to inject content scripts
- `host_permissions`: Access to Amazon.in and Amazon.com domains

## Limitations

- Only processes items visible on the current page (pagination not supported yet)
- Requires manual navigation to wishlist page
- Does not handle quantity selection (adds 1 of each item)
- May not work if Amazon updates their website structure

## Troubleshooting

### Extension Not Working

1. **Refresh the page** after installing the extension
2. **Check permissions** - ensure the extension has access to Amazon sites
3. **Verify wishlist page** - make sure you're on a valid wishlist URL

### Items Not Being Added

1. **Check item availability** - out-of-stock items cannot be added
2. **Look for errors** - open Chrome DevTools (F12) and check the Console
3. **Try manually** - verify you can manually add items to cart

### Button Disabled

- Ensure you're on an Amazon wishlist page (URL contains `/hz/wishlist/`)
- Check that the wishlist contains items
- Reload the page and try again

## Privacy & Security

- **No Data Collection**: This extension does not collect, store, or transmit any personal data
- **Local Processing**: All operations happen locally in your browser
- **No External Servers**: No communication with external servers
- **Open Source**: Code is fully visible and auditable

## Disclaimer

This extension is provided "as is" for personal use. It automates manual clicking and does not violate Amazon's terms of service as it simply performs actions you would normally do manually. However:

- Use responsibly and avoid excessive automation
- Amazon may update their website, which could break the extension
- The extension is not affiliated with or endorsed by Amazon

## Development

### File Structure

```
wish_list_to_cart_adder/
├── manifest.json       # Extension configuration
├── content.js          # Content script for DOM manipulation
├── popup.html          # Popup interface HTML
├── popup.css           # Popup styling
├── popup.js            # Popup logic
├── icons/              # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # This file
```

### Technologies Used

- **Manifest V3**: Latest Chrome extension format
- **Vanilla JavaScript**: No external dependencies
- **Modern CSS**: Gradients, animations, and responsive design

## Future Enhancements

- [ ] Support for pagination (multiple pages)
- [ ] Customizable delay settings
- [ ] Quantity selection per item
- [ ] Support for more Amazon domains (.co.uk, .de, etc.)
- [ ] Keyboard shortcuts
- [ ] Dark mode

## License

MIT License - Feel free to modify and distribute

## Support

If you encounter issues or have suggestions:
1. Check the Troubleshooting section above
2. Review the code in the repository
3. Open an issue with details about your problem

---

**Made with ❤️ by Mohammad Faiz Khan for Amazon shoppers who hate clicking the same button 100 times!**
