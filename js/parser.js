/**
 * parser.js - CSV解析モジュール
 * ver 3.2 - UI改善版
 */

import { saveToLocalStorage } from './storage.js';

/**
 * CSVテキストを行に分割（ダブルクォート内の改行を考慮）
 */
function splitCSVLines(csvText) {
    const lines = [];
    let currentLine = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];

        if (char === '"') {
            inQuotes = !inQuotes;
            currentLine += char;
        } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !inQuotes) {
            // ダブルクォート外の改行のみで行を分割
            if (currentLine.trim()) {
                lines.push(currentLine);
            }
            currentLine = '';
            // \r\nの場合は\nをスキップ
            if (char === '\r' && nextChar === '\n') {
                i++;
            }
        } else {
            currentLine += char;
        }
    }

    // 最後の行を追加
    if (currentLine.trim()) {
        lines.push(currentLine);
    }

    return lines;
}

/**
 * CSVの1行をパース（ダブルクォートで囲まれたカンマを考慮）
 */
export function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);

    return result;
}

/**
 * カラーミーショップCSVをパース
 */
export function parseColorMeCSV(csvText) {
    const lines = splitCSVLines(csvText);
    if (lines.length < 2) {
        throw new Error('CSVファイルが空です');
    }
    
    const headers = parseCSVLine(lines[0]);
    
    // 受注データCSV（sales_all.csv）の場合のカラム
    const indices = {
        salesId: headers.indexOf('売上ID'),
        orderDate: headers.indexOf('受注日'),
        customerId: headers.indexOf('購入者 顧客ID'),
        customerName: headers.indexOf('購入者 名前'),
        zip: headers.indexOf('購入者 郵便番号'),
        prefecture: headers.indexOf('購入者 都道府県'),
        address: headers.indexOf('購入者 住所'),
        email: headers.indexOf('購入者 メールアドレス'),
        phone: headers.indexOf('購入者 電話番号'),
        mobile: headers.indexOf('購入者 携帯番号'),
        paymentMethod: headers.indexOf('決済方法'),
        shippingFee: headers.indexOf('送料合計'),
        discountName: headers.indexOf('割引名称'),
        discountAmount: headers.indexOf('割引金額'),
        productCode: headers.indexOf('購入商品 型番'),
        productName: headers.indexOf('購入商品 商品名'),
        unitPrice: headers.indexOf('購入商品 販売価格(消費税込)'),
        quantity: headers.indexOf('購入商品 販売個数'),
        subtotal: headers.indexOf('購入商品 小計'),
        deliveryId: headers.indexOf('配送先ID')
    };
    
    // 売上詳細CSV（sales_detail.csv）の場合のカラム（後方互換性）
    if (indices.salesId === -1) {
        indices.salesId = headers.indexOf('売上ID');
        indices.orderDate = headers.indexOf('受注日');
        indices.customerId = headers.indexOf('顧客ID');
        indices.customerName = headers.indexOf('名前');
        indices.email = headers.indexOf('メールアドレス');
        indices.phone = headers.indexOf('電話番号');
        indices.mobile = headers.indexOf('携帯番号');
        indices.paymentMethod = headers.indexOf('決済方法');
        indices.productCode = headers.indexOf('型番');
        indices.productName = headers.indexOf('商品名');
        indices.unitPrice = headers.indexOf('販売価格(消費税込)');
        indices.quantity = headers.indexOf('販売個数');
        indices.subtotal = headers.indexOf('小計');
        indices.deliveryId = headers.indexOf('配送先ID');
    }
    
    if (indices.salesId === -1 || indices.productName === -1) {
        throw new Error('CSVファイルに必要な項目が見つかりません');
    }
    
    const ordersMap = new Map();
    
    for (let i = 1; i < lines.length; i++) {
        const columns = parseCSVLine(lines[i]);
        if (columns.length < headers.length - 10) continue;
        
        const salesId = columns[indices.salesId];
        if (!salesId) continue;
        
        if (!ordersMap.has(salesId)) {
            ordersMap.set(salesId, {
                salesId: salesId,
                deliveryId: columns[indices.deliveryId] || '',
                orderDate: columns[indices.orderDate] || '',
                customerId: columns[indices.customerId] || '',
                customerName: columns[indices.customerName] || '',
                zip: columns[indices.zip] || '',
                prefecture: columns[indices.prefecture] || '',
                address: columns[indices.address] || '',
                email: columns[indices.email] || '',
                phone: columns[indices.phone] || '',
                mobile: columns[indices.mobile] || '',
                paymentMethod: columns[indices.paymentMethod] || '',
                shippingFee: parseFloat(columns[indices.shippingFee]) || 0,
                discountName: columns[indices.discountName] || '',
                discountAmount: parseFloat(columns[indices.discountAmount]) || 0,
                items: [],
                tokuisakiCode: '',
                matchedCustomer: null,
                matchMethod: ''
            });
        }
        
        const order = ordersMap.get(salesId);
        order.items.push({
            productCode: columns[indices.productCode] || '',
            productName: columns[indices.productName] || '',
            unitPrice: parseFloat(columns[indices.unitPrice]) || 0,
            quantity: parseFloat(columns[indices.quantity]) || 0,
            subtotal: parseFloat(columns[indices.subtotal]) || 0
        });
    }
    
    if (ordersMap.size === 0) {
        throw new Error('有効な受注データが見つかりませんでした');
    }
    
    const orders = Array.from(ordersMap.values());
    console.log(`受注データ読み込み完了: ${orders.length}件`);
    return orders;
}

/**
 * 弥生販売 顧客台帳CSVをパース
 */
export function parseYayoiCSV(csvText) {
    const lines = splitCSVLines(csvText);
    if (lines.length < 5) {
        throw new Error('顧客台帳CSVが空です');
    }

    // 弥生販売のCSVは特殊なフォーマット
    // 行0: タイトル行（"得意先リスト"）
    // 行1: 空行
    // 行2: ソート順（"コード順"など）
    // 行3: 空行
    // 行4: ヘッダー行（空列, "コード", "名称", ...）
    // 行5以降: データ行

    // ヘッダー行を取得（行4）
    const headerRow = parseCSVLine(lines[4]);

    // カラムのインデックスを動的に検索（空列があるため）
    const indices = {
        customerCode: headerRow.indexOf('コード'),
        name: headerRow.indexOf('名称'),
        furigana: headerRow.indexOf('フリガナ'),
        phone: headerRow.indexOf('TEL'),
        email: headerRow.indexOf('メールアドレス')
    };

    // 必須項目が見つからない場合はエラー
    if (indices.customerCode === -1 || indices.name === -1) {
        throw new Error('CSVファイルに必要な項目（コード、名称）が見つかりません');
    }

    const customers = [];

    // 行5以降がデータ行
    for (let i = 5; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const columns = parseCSVLine(line);
        if (columns.length < Math.max(indices.customerCode, indices.name) + 1) continue;

        const customerCode = columns[indices.customerCode] || '';
        const name = columns[indices.name] || '';

        // コードと名称が存在する行のみ追加
        if (customerCode && name) {
            customers.push({
                customerCode: customerCode.trim(),
                name: name.trim(),
                furigana: indices.furigana !== -1 ? (columns[indices.furigana] || '').trim() : '',
                phone: indices.phone !== -1 ? (columns[indices.phone] || '').trim() : '',
                email: indices.email !== -1 ? (columns[indices.email] || '').trim() : ''
            });
        }
    }

    if (customers.length === 0) {
        throw new Error('有効な顧客データが見つかりませんでした');
    }

    console.log(`顧客台帳読み込み完了: ${customers.length}件`);

    // LocalStorageに自動保存
    if (saveToLocalStorage(customers)) {
        console.log('LocalStorageに保存しました');
    }

    return customers;
}
