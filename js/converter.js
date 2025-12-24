/**
 * converter.js - 弥生販売フォーマットへの変換
 * ver 3.2 - UI改善版
 */

import { setProducts, productNameMap, shippingCodes, calculateCODFee, YAYOI_FORMAT } from './config.js';

/**
 * 商品がセット商品かチェック
 * @param {string} productCode - 商品コード
 * @returns {boolean}
 */
function isSetProduct(productCode) {
    return setProducts.hasOwnProperty(productCode);
}

/**
 * 今日の日付をYYYYMMDD形式で取得
 */
function getTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return year + month + day;
}

/**
 * 受注データを弥生販売の売上伝票形式に変換
 * @param {Array} orders - 選択された受注データ
 * @param {Object} settings - 設定（伝票番号、担当者コードなど）
 * @returns {string} - タブ区切りテキスト
 */
export function convertToYayoi(orders, settings) {
    const {
        denpyoNoStart = '1',
        tantoshaCode = YAYOI_FORMAT.DEFAULT_TANTOSHA_CODE
    } = settings;

    let tsvLines = [];
    let currentDenpyoNo = parseInt(denpyoNoStart) || 1;

    // データダウンロード日（今日の日付）を使用
    const denpyoDate = getTodayDate();

    orders.forEach((order, orderIndex) => {
        let rowCode = 1;

        // 決済方法から納入コードを決定
        const isCOD = order.paymentMethod.includes('代引');
        const nounyuCode = isCOD ? YAYOI_FORMAT.DEFAULT_NOUNYU_CODE_COD : YAYOI_FORMAT.DEFAULT_NOUNYU_CODE_BANK;

        // 購入者名を取得
        const customerName = order.customerName || 'テネモスショップ';
        
        // 商品明細を出力
        order.items.forEach(item => {
            if (isSetProduct(item.productCode)) {
                // セット商品の場合は構成商品に分解
                const setComponents = setProducts[item.productCode];
                setComponents.forEach(component => {
                    const row = createRow({
                        denpyoDate,
                        denpyoNo: String(currentDenpyoNo).padStart(4, '0'),
                        tokuisakiCode: order.tokuisakiCode,
                        nounyuCode,
                        tantoshaCode,
                        rowCode: rowCode++,
                        productCode: component.code,
                        productName: component.name,
                        quantity: item.quantity,
                        unitPrice: component.price,
                        amount: component.price * item.quantity,
                        customerName
                    });
                    tsvLines.push(row);
                });
            } else {
                // 通常商品
                const row = createRow({
                    denpyoDate,
                    denpyoNo: String(currentDenpyoNo).padStart(4, '0'),
                    tokuisakiCode: order.tokuisakiCode,
                    nounyuCode,
                    tantoshaCode,
                    rowCode: rowCode++,
                    productCode: item.productCode,
                    productName: productNameMap[item.productCode] || item.productName,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    amount: item.subtotal,
                    customerName
                });
                tsvLines.push(row);
            }
        });

        // 送料を追加
        if (order.shippingFee > 0) {
            const shippingCode = shippingCodes[order.prefecture] || '0010';
            const row = createRow({
                denpyoDate,
                denpyoNo: String(currentDenpyoNo).padStart(4, '0'),
                tokuisakiCode: order.tokuisakiCode,
                nounyuCode,
                tantoshaCode,
                rowCode: rowCode++,
                productCode: shippingCode,
                productName: YAYOI_FORMAT.SHIPPING_PRODUCT_NAME,
                quantity: 1,
                unitPrice: order.shippingFee,
                amount: order.shippingFee,
                customerName
            });
            tsvLines.push(row);
        }

        // 代引き手数料を追加
        if (isCOD) {
            const itemsTotal = order.items.reduce((sum, item) => sum + item.subtotal, 0);
            const paymentTotal = itemsTotal + order.shippingFee;
            const codFee = calculateCODFee(paymentTotal);

            const row = createRow({
                denpyoDate,
                denpyoNo: String(currentDenpyoNo).padStart(4, '0'),
                tokuisakiCode: order.tokuisakiCode,
                nounyuCode,
                tantoshaCode,
                rowCode: rowCode++,
                productCode: YAYOI_FORMAT.COD_FEE_PRODUCT_CODE,
                productName: YAYOI_FORMAT.COD_FEE_PRODUCT_NAME,
                quantity: 1,
                unitPrice: codFee,
                amount: codFee,
                customerName
            });
            tsvLines.push(row);
        }

        // クーポン割引を追加（マイナス金額）
        if (order.discountAmount > 0) {
            const discountAmount = -Math.abs(order.discountAmount);
            const row = createRow({
                denpyoDate,
                denpyoNo: String(currentDenpyoNo).padStart(4, '0'),
                tokuisakiCode: order.tokuisakiCode,
                nounyuCode,
                tantoshaCode,
                rowCode: rowCode++,
                productCode: YAYOI_FORMAT.DISCOUNT_PRODUCT_CODE,
                productName: order.discountName || 'クーポン割引',
                quantity: 1,
                unitPrice: discountAmount,
                amount: discountAmount,
                customerName
            });
            tsvLines.push(row);
        }
        
        currentDenpyoNo++;
    });
    
    return tsvLines.join(YAYOI_FORMAT.LINE_BREAK);
}

/**
 * 日付をYYYYMMDD形式に変換
 */
function formatDate(dateStr) {
    if (!dateStr) return '20251202';
    
    const parts = dateStr.split(/[/-]/);
    if (parts.length !== 3) return '20251202';
    
    const year = parts[0];
    const month = parts[1].padStart(2, '0');
    const day = parts[2].padStart(2, '0');
    
    return year + month + day;
}

/**
 * 弥生販売の1行を作成（59項目）
 */
function createRow(data) {
    return [
        1,                              // 見出し1: 削除マーク
        1,                              // 見出し2: 締フラグ
        0,                              // 見出し3: チェック
        data.denpyoDate,                // 見出し4: 伝票日付
        data.denpyoNo,                  // 見出し5: 伝票番号
        24,                             // 見出し6: 伝票区分
        2,                              // 見出し7: 取引区分
        5,                              // 見出し8: 税転嫁
        1,                              // 見出し9: 金額端数処理
        1,                              // 見出し10: 税端数処理
        data.tokuisakiCode,             // 見出し11: 得意先コード
        data.nounyuCode,                // 見出し12: 納入コード
        data.tantoshaCode,              // 見出し13: 担当者コード
        data.rowCode,                   // 見出し14: 行コード
        1,                              // 見出し15: 明細区分
        data.productCode,               // 見出し16: 商品コード
        '',                             // 見出し17: 入金区分コード
        data.productName,               // 見出し18: 商品名
        13,                             // 見出し19: 課税区分
        '',                             // 見出し20
        0,                              // 見出し21
        0,                              // 見出し22
        '',                             // 見出し23
        data.quantity,                  // 見出し24: 数量
        data.unitPrice,                 // 見出し25: 単価
        data.amount,                    // 見出し26: 金額
        '',                             // 見出し27
        data.unitPrice,                 // 見出し28: 単価（再度）
        0,                              // 見出し29
        0,                              // 見出し30
        '',                             // 見出し31
        2,                              // 見出し32
        2,                              // 見出し33
        '',                             // 見出し34
        '',                             // 見出し35
        '',                             // 見出し36
        '',                             // 見出し37
        '',                             // 見出し38
        '',                             // 見出し39
        data.customerName || 'テネモスショップ',  // 見出し40: 購入者名
        '',                             // 見出し41
        '',                             // 見出し42
        '',                             // 見出し43
        '',                             // 見出し44
        '',                             // 見出し45
        '',                             // 見出し46
        '',                             // 見出し47
        '',                             // 見出し48
        '',                             // 見出し49
        '',                             // 見出し50
        '',                             // 見出し51
        '',                             // 見出し52
        '',                             // 見出し53: 得意先名
        '',                             // 見出し54
        '',                             // 見出し55
        '',                             // 見出し56
        '',                             // 見出し57
        '',                             // 見出し58
        ''                              // 見出し59
    ].join(YAYOI_FORMAT.DELIMITER);
}

/**
 * Shift-JISでテキストファイルをダウンロード
 */
export function downloadAsShiftJIS(content, filename) {
    // encoding.jsを使用してShift-JISに変換
    if (typeof Encoding === 'undefined') {
        throw new Error('encoding.jsが読み込まれていません');
    }
    
    const sjisArray = Encoding.convert(Encoding.stringToCode(content), {
        to: 'SJIS',
        from: 'UNICODE'
    });
    const uint8Array = new Uint8Array(sjisArray);
    const blob = new Blob([uint8Array], { type: 'text/plain;charset=shift_jis' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
