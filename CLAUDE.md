# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

カラーミーショップ（Color Me Shop）の受注データを弥生販売（Yayoi Sales）の売上伝票形式に変換するWebアプリケーション。月末の経理作業を効率化します。

Browser-based ES6 Modules application. No build step required.

## Commands

```bash
# Start development server (opens browser automatically)
npm start

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

**Two-step workflow** (required because new customers must be imported into Yayoi before generating sales slips):

**Step 1: Customer Matching & Registration**
1. Upload Color Me CSV (Shift-JIS) + Yayoi customer master CSV (UTF-8 BOM)
2. Parse files → extract orders and customer data
3. Match customers by priority: email → phone (hyphen-normalized) → full name
4. Generate new customer codes starting from `max(existing codes) + 1`
5. Export new customers as TXT (Shift-JIS, tab-delimited, 48 fields)
6. **User imports new customers into Yayoi Sales** → marks as registered in UI

**Step 2: Sales Slip Generation**
1. User selects orders to convert (checkboxes)
2. Decompose set products into components (config.js)
3. Add shipping fees (prefecture-based codes), COD fees (tiered calculation), coupon discounts
4. Generate sales slips as TXT (Shift-JIS, tab-delimited, CRLF, 59 fields)
5. Download for Yayoi import

**State Management**: Global variables in main.js (`colormeOrders`, `yayoiCustomers`, `newCustomersList`) track workflow state. Customer master data persists in LocalStorage between sessions.

### Key Data Transformations

**Set Products**: Product codes defined in `setProducts` (config.js) are automatically decomposed into component items during conversion. Example: '1229' → ['1221', '1224'].

**Payment Method Logic**:
- 代引き (Cash on Delivery) → nounyuCode = '001', adds COD fee row calculated via `calculateCODFee()`
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

## File Encoding Handling

- **Input**: Color Me CSV (Shift-JIS), Yayoi CSV (UTF-8 BOM)
- **Output**: All TXT files (Shift-JIS, tab-delimited, CRLF)
- **External dependency**: encoding.js (CDN loaded in index.html) - handles Shift-JIS conversion via `downloadAsShiftJIS()` in converter.js

## Common Issues

**"Failed to load module script" error**: Application opened via `file://` protocol. Must use local server.

**Customer matching fails**: Yayoi customer master CSV must have email addresses registered. Matching prioritizes email → phone → name.

**Output file appears garbled in text editor**: Expected behavior. Import into Yayoi Sales for proper Shift-JIS display.
