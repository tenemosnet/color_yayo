# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

カラーミーショップ（Color Me Shop）の受注データを弥生販売（Yayoi Sales）の売上伝票形式に変換するWebアプリケーション。月末の経理作業を効率化します。

## Commands

### Development Server

```bash
# Start development server (opens browser automatically)
npm start
# or
npm run dev

# Alternative methods
npx http-server -p 8000 -o
python3 -m http.server 8000
```

**CRITICAL**: Must run via local server. ES6 Modules will NOT work with `file://` protocol due to CORS restrictions.

## Architecture

### Module Structure

ES6 Modules with clear separation of concerns:

1. **main.js** - Application lifecycle and event handling
   - Initializes all event listeners
   - Coordinates workflow between modules
   - Global state management (colormeOrders, yayoiCustomers, newCustomersList)

2. **config.js** - Business rules configuration
   - `setProducts`: Set product definitions (product bundles that need to be decomposed)
   - `shippingCodes`: Prefecture-to-shipping-code mappings
   - `calculateCODFee(paymentTotal)`: Cash-on-delivery fee calculation logic
   - `YAYOI_FORMAT`: Output format constants (59 fields, tab-delimited, CRLF, Shift-JIS)

3. **parser.js** - CSV parsing
   - `parseColorMeCSV()`: Parses Shift-JIS encoded Color Me Shop CSV
   - `parseYayoiCSV()`: Parses UTF-8 BOM encoded Yayoi customer master CSV

4. **matcher.js** - Customer matching logic
   - Priority 1: Email address
   - Priority 2: Phone number (handles hyphen variations)
   - Priority 3: Full name match
   - Auto-generates new customer codes starting from max existing code + 1

5. **converter.js** - Data transformation
   - `convertToYayoi()`: Converts orders to Yayoi sales slip format
   - Handles set product decomposition
   - Adds shipping fees, COD fees, coupon discounts
   - `downloadAsShiftJIS()`: Uses encoding.js for Shift-JIS conversion

6. **storage.js** - LocalStorage persistence
   - Customer master data persistence
   - JSON import/export for cross-PC data transfer

7. **ui.js** - UI operations
   - Status messages, data tables, button states

### Data Flow

```
1. File Upload (カラーミーCSV + 弥生販売CSV)
2. CSV Parsing (parser.js)
3. Customer Matching (matcher.js) → Identifies existing vs new customers
4. New Customer Export (if needed) → TXT file for Yayoi import
5. Order Conversion (converter.js) → Sales slip TXT generation
6. Download (Shift-JIS, tab-delimited, CRLF)
```

### Key Data Transformations

**Set Products**: Certain product codes (e.g., '1229', '1378') are decomposed into component products defined in `config.js`. The converter automatically expands these during conversion.

**Payment Method Logic**:
- 代引き (Cash on Delivery) → nounyuCode = '001', adds COD fee row
- その他 → nounyuCode = '003'

**Output Format**: 59-field tab-delimited format matching Yayoi Sales import specification. Field 40 is fixed to 'テネモスショップ'.

## Configuration

### Add/Modify Set Products

Edit `js/config.js`:

```javascript
export const setProducts = {
    '1229': [
        { code: '1221', name: 'ビダウォーターソープ詰替用', price: 2420 },
        { code: '1224', name: '泡ポンプ400ml空容器', price: 800 }
    ]
};
```

### Update Shipping Codes

Edit `js/config.js`:

```javascript
export const shippingCodes = {
    '北海道': '0013',
    '東京都': '0010',
    // ...
};
```

### Modify COD Fee Calculation

Edit `js/config.js`:

```javascript
export function calculateCODFee(paymentTotal) {
    if (paymentTotal < 10000) return 330;
    if (paymentTotal < 30000) return 440;
    if (paymentTotal < 100000) return 660;
    return 1100;
}
```

### Change Default Values

Edit constants in `js/config.js`:

```javascript
export const YAYOI_FORMAT = {
    DEFAULT_TANTOSHA_CODE: '14',  // Default salesperson code
    DEFAULT_NOUNYU_CODE_BANK: '003',  // Bank transfer
    DEFAULT_NOUNYU_CODE_COD: '001',   // Cash on delivery
    // ...
};
```

## Development Notes

### File Encoding

- **Input**: Color Me CSV (Shift-JIS), Yayoi CSV (UTF-8 BOM)
- **Output**: All TXT files (Shift-JIS, tab-delimited, CRLF)
- **External dependency**: encoding.js (loaded via CDN in index.html)

### Debugging

- Use browser DevTools (F12) → Console
- Hard refresh (Ctrl+Shift+R) after modifying config.js
- ES6 Modules reload automatically on change

### Common Issues

**"Failed to load module script" error**: Application opened via `file://` protocol. Must use local server.

**Customer matching fails**: Check that Yayoi customer master CSV has email addresses registered. Matching prioritizes email, then phone, then name.

**Text file appears garbled**: Expected behavior when opening in text editor. Import into Yayoi Sales for proper Shift-JIS display.

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari
- ❌ Internet Explorer not supported (requires ES6 Modules)
