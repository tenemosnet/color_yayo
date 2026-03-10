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
 * 住所の先頭8文字比較（都道府県+住所を結合して比較）
 * @param {Object} colormeCustomer - カラーミーの顧客情報
 * @param {Object} yayoiCustomer - 弥生販売の顧客情報
 * @returns {boolean}
 */
function isAddressSimilar(colormeCustomer, yayoiCustomer) {
    const cmPref = (colormeCustomer.prefecture || '').trim();
    const cmAddr = `${cmPref}${(colormeCustomer.address || '').trim()}`;
    const yaAddr = (yayoiCustomer.address1 || '').trim();
    if (!cmAddr || !yaAddr) return false;
    return cmAddr.substring(0, 8) === yaAddr.substring(0, 8);
}

/**
 * 照合済み顧客の情報差異を検出
 * @param {Object} colormeCustomer - カラーミーの顧客情報
 * @param {Object} yayoiCustomer - 弥生販売の顧客情報
 * @param {string} matchMethod - 照合方法
 * @returns {Array} - 警告の配列
 */
function detectDiscrepancies(colormeCustomer, yayoiCustomer, matchMethod) {
    const warnings = [];

    // 名前の差異チェック（メールアドレス一致・電話番号一致の両方で実施）
    // スペース（半角・全角）の有無だけの違いは無視する
    const cmName = (colormeCustomer.customerName || '').trim();
    const yaName = (yayoiCustomer.name || '').trim();
    const cmNameNoSpace = cmName.replace(/[\s　]/g, '');
    const yaNameNoSpace = yaName.replace(/[\s　]/g, '');
    if (cmName && yaName && cmNameNoSpace !== yaNameNoSpace) {
        warnings.push({
            type: 'name_change',
            label: '氏名変更の可能性',
            detail: `カラーミー: ${cmName} / 弥生: ${yaName}`
        });
    }

    // 住所の差異チェック（メールアドレス一致・電話番号一致の両方で実施）
    if (matchMethod === 'メールアドレス一致' || matchMethod === '電話番号一致') {
        const cmPref = (colormeCustomer.prefecture || '').trim();
        const yaPref = (yayoiCustomer.prefecture || '').trim();
        const cmAddr = `${cmPref}${(colormeCustomer.address || '').trim()}`;
        const yaAddr = (yayoiCustomer.address1 || '').trim();

        if (cmAddr && yaAddr) {
            if ((cmPref && yaPref && cmPref !== yaPref) ||
                (cmAddr.substring(0, 8) !== yaAddr.substring(0, 8))) {
                warnings.push({
                    type: 'address_change',
                    label: '住所変更の可能性',
                    detail: `カラーミー: ${cmAddr.substring(0, 20)} / 弥生: ${yaAddr.substring(0, 20)}`
                });
            }
        }
    }

    return warnings;
}

/**
 * カラーミーの顧客と弥生販売の顧客を照合
 * @param {Object} colormeCustomer - カラーミーの顧客情報
 * @param {Array} yayoiCustomers - 弥生販売の顧客リスト
 * @returns {Object|null} - マッチ結果（customer, method, warnings）またはnull
 */
export function matchCustomer(colormeCustomer, yayoiCustomers) {
    // 優先度1: メールアドレス
    if (colormeCustomer.email) {
        const match = yayoiCustomers.find(y =>
            y.email && y.email.toLowerCase() === colormeCustomer.email.toLowerCase()
        );
        if (match) {
            const warnings = detectDiscrepancies(colormeCustomer, match, 'メールアドレス一致');
            return { customer: match, method: 'メールアドレス一致', warnings };
        }
    }

    // 優先度2: 電話番号（ハイフンなしで比較）
    const colormePhone = cleanPhone(colormeCustomer.phone || colormeCustomer.mobile || '');

    if (colormePhone) {
        const match = yayoiCustomers.find(y =>
            y.phone && cleanPhone(y.phone) === colormePhone
        );
        if (match) {
            const warnings = detectDiscrepancies(colormeCustomer, match, '電話番号一致');
            return { customer: match, method: '電話番号一致', warnings };
        }
    }

    // 優先度3: 顧客名（完全一致）+ 住所確認
    // ※ここに到達した時点でメール・電話の照合は失敗済み
    if (colormeCustomer.customerName) {
        const nameMatches = yayoiCustomers.filter(y =>
            y.name && y.name === colormeCustomer.customerName
        );

        if (nameMatches.length > 0) {
            const addressMatches = nameMatches.filter(y => isAddressSimilar(colormeCustomer, y));

            if (addressMatches.length >= 2) {
                // ケースC: 同名同住所が複数 → 弥生の重複登録と判断。最初の1件にマッチ＋警告
                return {
                    customer: addressMatches[0],
                    method: '顧客名+住所一致',
                    warnings: [{
                        type: 'yayoi_duplicate',
                        label: '弥生データに重複登録の可能性',
                        detail: `「${colormeCustomer.customerName}」が弥生に${addressMatches.length}件登録されています。弥生データの見直しをお勧めします。`
                    }]
                };
            }

            // ケースA (住所一致1件): 携帯・メール変更の同一人物と推定されるが確認不可 → 新規扱い
            // ケースB (住所一致0件): 同姓同名の別人と判断 → 新規扱い
            return null;
        }
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
                    furigana: order.furigana,
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
    const allWarnings = [];

    // 各受注に対して顧客照合
    colormeOrders.forEach(order => {
        const match = matchCustomer(order, yayoiCustomers);

        if (match) {
            // 既存顧客
            order.matchedCustomer = match.customer;
            order.matchMethod = match.method;
            order.matchWarnings = match.warnings || [];
            order.tokuisakiCode = match.customer.customerCode;
            existingCount++;

            // 警告がある場合に集約
            if (match.warnings && match.warnings.length > 0) {
                allWarnings.push({
                    salesId: order.salesId,
                    customerName: order.customerName,
                    tokuisakiCode: match.customer.customerCode,
                    warnings: match.warnings
                });
            }
        } else {
            // 新規顧客
            order.matchWarnings = [];
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
        newCustomersList,
        warnings: allWarnings
    };
}
