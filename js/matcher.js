/**
 * matcher.js - 顧客照合ロジック
 * ver 3.2 - UI改善版
 */

/**
 * 電話番号の正規化（ハイフン、スペース、括弧を除去）
 */
function cleanPhone(phone) {
    return phone.replace(/[-\s()]/g, '');
}

/**
 * カラーミーの顧客と弥生販売の顧客を照合
 * @param {Object} colormeCustomer - カラーミーの顧客情報
 * @param {Array} yayoiCustomers - 弥生販売の顧客リスト
 * @returns {Object|null} - マッチ結果（customer, method）またはnull
 */
export function matchCustomer(colormeCustomer, yayoiCustomers) {
    // 優先度1: メールアドレス
    if (colormeCustomer.email) {
        const match = yayoiCustomers.find(y => 
            y.email && y.email.toLowerCase() === colormeCustomer.email.toLowerCase()
        );
        if (match) return { customer: match, method: 'メールアドレス一致' };
    }
    
    // 優先度2: 電話番号（ハイフンなしで比較）
    const colormePhone = cleanPhone(colormeCustomer.phone || colormeCustomer.mobile || '');
    
    if (colormePhone) {
        const match = yayoiCustomers.find(y => 
            y.phone && cleanPhone(y.phone) === colormePhone
        );
        if (match) return { customer: match, method: '電話番号一致' };
    }
    
    // 優先度3: 顧客名（完全一致）
    if (colormeCustomer.customerName) {
        const match = yayoiCustomers.find(y => 
            y.name && y.name === colormeCustomer.customerName
        );
        if (match) return { customer: match, method: '顧客名一致' };
    }
    
    // 照合失敗
    return null;
}

/**
 * 最大顧客コードを取得
 * @param {Array} yayoiCustomers - 弥生販売の顧客リスト
 * @returns {number} - 最大顧客コード
 */
export function getMaxCustomerCode(yayoiCustomers) {
    if (yayoiCustomers.length === 0) return 0;
    
    const maxCode = Math.max(...yayoiCustomers.map(c => {
        const code = parseInt(c.customerCode.replace(/[^0-9]/g, ''));
        return isNaN(code) ? 0 : code;
    }));
    
    return maxCode;
}

/**
 * 新規顧客リストを作成
 * @param {Array} colormeOrders - カラーミーの受注データ
 * @param {number} startCode - 開始顧客コード
 * @returns {Array} - 新規顧客リスト
 */
export function createNewCustomersList(colormeOrders, startCode) {
    const newCustomers = [];
    const seenEmails = new Set();
    const seenNames = new Set();
    let currentCode = startCode;
    
    colormeOrders.forEach(order => {
        if (!order.matchedCustomer) {
            // 重複チェック（メールアドレスまたは名前）
            const isDuplicate = order.email && seenEmails.has(order.email) || 
                               !order.email && seenNames.has(order.customerName);
            
            if (!isDuplicate) {
                newCustomers.push({
                    assignedCode: String(currentCode).padStart(6, '0'),
                    customerName: order.customerName,
                    zip: order.zip,
                    prefecture: order.prefecture,
                    address: order.address,
                    email: order.email,
                    phone: order.phone || order.mobile,
                    registered: false // チェックボックスの状態
                });
                
                // 受注データにも得意先コードを設定
                order.tokuisakiCode = String(currentCode).padStart(6, '0');
                
                // 重複チェック用に記録
                if (order.email) seenEmails.add(order.email);
                seenNames.add(order.customerName);
                
                currentCode++;
            } else {
                // 重複している場合は、既に割り当てたコードを使用
                const existingCustomer = newCustomers.find(nc => 
                    (order.email && nc.email === order.email) ||
                    (!order.email && nc.customerName === order.customerName)
                );
                if (existingCustomer) {
                    order.tokuisakiCode = existingCustomer.assignedCode;
                }
            }
        }
    });
    
    return newCustomers;
}

/**
 * 顧客照合処理を実行
 * @param {Array} colormeOrders - カラーミーの受注データ
 * @param {Array} yayoiCustomers - 弥生販売の顧客リスト
 * @returns {Object} - 照合結果
 */
export function performCustomerMatching(colormeOrders, yayoiCustomers) {
    let existingCount = 0;
    let newCount = 0;
    
    // 各受注に対して顧客照合
    colormeOrders.forEach(order => {
        const match = matchCustomer(order, yayoiCustomers);
        
        if (match) {
            // 既存顧客
            order.matchedCustomer = match.customer;
            order.matchMethod = match.method;
            order.tokuisakiCode = match.customer.customerCode;
            existingCount++;
        } else {
            // 新規顧客
            newCount++;
        }
    });
    
    // 最大顧客コードを取得
    const maxCode = getMaxCustomerCode(yayoiCustomers);
    const nextCode = maxCode + 1;
    
    // 新規顧客リストを作成
    const newCustomersList = createNewCustomersList(colormeOrders, nextCode);
    
    return {
        existingCount,
        newCount,
        maxCode,
        nextCode,
        newCustomersList
    };
}
