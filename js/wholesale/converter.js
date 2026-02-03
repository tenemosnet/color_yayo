/**
 * converter.js - 卸販売用 弥生販売フォーマット変換
 */

import { getNounyuCodeByCustomer } from './registry.js';

// 弥生販売フォーマット設定
const YAYOI_FORMAT = {
    FIELD_COUNT: 59,
    DELIMITER: '\t',
    LINE_BREAK: '\r\n'
};

/**
 * 商品データを弥生販売の売上伝票形式に変換
 * @param {Array<Object>} products - 商品データ配列
 * @param {Object} settings - 設定
 * @returns {string} - タブ区切りテキスト
 */
export function convertToYayoiFormat(products, settings) {
    const {
        denpyoNo = '0001',
        orderDate,
        tantoshaCode = '0',
        tokuisakiCode = '000000',
        customerName = '',
        shippingCode = null,
        shippingUnitPrice = 0,
        shippingName = '送料',
        torihikiKubun = 2,      // 取引区分（1:掛売, 2:現金, 3:都度請求, 4:サンプル）
        nounyuCode = '003'      // 納入コード
    } = settings;

    const tsvLines = [];

    // 日付をYYYYMMDD形式に変換
    const denpyoDate = formatDateToYayoi(orderDate);
    let rowCode = 1;

    // 商品行を追加
    products.forEach((product) => {
        const row = createRow({
            denpyoDate,
            denpyoNo: String(denpyoNo).padStart(4, '0'),
            tokuisakiCode: tokuisakiCode,
            nounyuCode: nounyuCode,
            torihikiKubun: torihikiKubun,
            tantoshaCode,
            rowCode: rowCode++,
            productCode: product.code,
            productName: product.name,
            quantity: product.quantity,
            unitPrice: product.unitPrice,
            amount: product.amount,
            isReducedTax: product.isReducedTax || false,
            customerName: customerName
        });
        tsvLines.push(row);
    });

    // 送料行を追加（shippingCodeが指定されている場合）
    if (shippingCode) {
        const shippingAmount = shippingUnitPrice * 1;  // 数量1
        const shippingRow = createRow({
            denpyoDate,
            denpyoNo: String(denpyoNo).padStart(4, '0'),
            tokuisakiCode: tokuisakiCode,
            nounyuCode: nounyuCode,
            torihikiKubun: torihikiKubun,
            tantoshaCode,
            rowCode: rowCode++,
            productCode: shippingCode,
            productName: shippingName,
            quantity: 1,
            unitPrice: shippingUnitPrice,
            amount: shippingAmount,
            customerName: customerName
        });
        tsvLines.push(shippingRow);
    }

    return tsvLines.join(YAYOI_FORMAT.LINE_BREAK);
}

/**
 * 日付をYYYYMMDD形式に変換
 * @param {string} dateStr - YYYY-MM-DD形式の日付
 * @returns {string}
 */
function formatDateToYayoi(dateStr) {
    if (!dateStr) {
        const today = new Date();
        return formatDate(today);
    }

    // YYYY-MM-DD形式から変換
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return parts[0] + parts[1].padStart(2, '0') + parts[2].padStart(2, '0');
    }

    // すでにYYYYMMDD形式の場合はそのまま返す
    if (/^\d{8}$/.test(dateStr)) {
        return dateStr;
    }

    const today = new Date();
    return formatDate(today);
}

/**
 * DateオブジェクトをYYYYMMDD形式にフォーマット
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

/**
 * 弥生販売の1行を作成（59項目）
 * @param {Object} data
 * @returns {string}
 */
function createRow(data) {
    return [
        1,                              // 1: 削除マーク
        1,                              // 2: 締フラグ
        0,                              // 3: チェック
        data.denpyoDate,                // 4: 伝票日付
        data.denpyoNo,                  // 5: 伝票番号
        24,                             // 6: 伝票区分
        data.torihikiKubun || 2,        // 7: 取引区分（1:掛売, 2:現金, 3:都度請求, 4:サンプル）
        5,                              // 8: 税転嫁
        1,                              // 9: 金額端数処理
        1,                              // 10: 税端数処理
        data.tokuisakiCode,             // 11: 得意先コード
        data.nounyuCode,                // 12: 納入コード
        data.tantoshaCode,              // 13: 担当者コード
        data.rowCode,                   // 14: 行コード
        1,                              // 15: 明細区分
        data.productCode,               // 16: 商品コード
        '',                             // 17: 入金区分コード
        data.productName,               // 18: 商品名
        data.isReducedTax ? 30 : 13,    // 19: 課税区分（13=10%, 30=軽減8%）
        '',                             // 20
        0,                              // 21
        0,                              // 22
        '',                             // 23
        data.quantity,                  // 24: 数量
        data.unitPrice,                 // 25: 単価
        data.amount,                    // 26: 金額
        '',                             // 27
        data.unitPrice,                 // 28: 単価（再度）
        0,                              // 29
        0,                              // 30
        '',                             // 31
        2,                              // 32
        2,                              // 33
        '',                             // 34
        '',                             // 35
        '',                             // 36
        '',                             // 37
        '',                             // 38
        '',                             // 39
        data.customerName,              // 40: 購入者名/備考
        '',                             // 41
        '',                             // 42
        '',                             // 43
        '',                             // 44
        '',                             // 45
        '',                             // 46
        '',                             // 47
        '',                             // 48
        '',                             // 49
        '',                             // 50
        '',                             // 51
        '',                             // 52
        '',                             // 53
        '',                             // 54
        '',                             // 55
        '',                             // 56
        '',                             // 57
        '',                             // 58
        ''                              // 59
    ].join(YAYOI_FORMAT.DELIMITER);
}

/**
 * Shift-JISでテキストファイルをダウンロード
 * @param {string} content - テキスト内容
 * @param {string} filename - ファイル名
 */
export function downloadAsShiftJIS(content, filename) {
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

/**
 * 今日の日付文字列を取得（ファイル名用）
 * @returns {string} YYYYMMDD形式
 */
export function getDateString() {
    const today = new Date();
    return formatDate(today);
}

/**
 * 顧客情報から納入先コードを決定
 * @param {Object} customer - 顧客情報 {code, torihikiKubun, ...}
 * @returns {string} 納入先コード
 */
export function determineNounyuCode(customer) {
    if (!customer) return '';
    return getNounyuCodeByCustomer(customer.code, customer.torihikiKubun);
}
