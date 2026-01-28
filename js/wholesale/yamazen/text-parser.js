/**
 * text-parser.js - メール本文から商品データを抽出
 * 山善様のメール形式に対応
 */

/**
 * 全角数字を半角に変換
 * @param {string} text
 * @returns {string}
 */
export function zenToHan(text) {
    return text.replace(/[０-９]/g, (s) =>
        String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
    );
}

/**
 * メール本文から商品データを抽出
 * @param {string} emailBody - メール本文
 * @returns {Array<Object>} [{ code, name, quantity, unit, unitPrice, amount }, ...]
 */
export function extractProductData(emailBody) {
    const products = [];
    const lines = emailBody.split(/\r?\n/);

    // 商品行のパターン: 4桁コード + 商品名 + 数量 + 単位
    // 例: "1110 ノーマルレフィル　２４個"
    // 例: "1374 ペットアグア1リットル　１２本"
    const productPattern = /^(\d{4})\s+(.+?)[　\s]+([０-９\d]+)\s*(本|個|ケ|ヶ|セット|箱|袋|パック)?$/;

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        const match = trimmedLine.match(productPattern);
        if (match) {
            const code = match[1];
            const name = match[2].trim();
            const quantityStr = zenToHan(match[3]);
            const quantity = parseInt(quantityStr, 10);
            const unit = match[4] || '';

            if (!isNaN(quantity) && quantity > 0) {
                products.push({
                    code: code,
                    name: name,
                    quantity: quantity,
                    unit: unit,
                    unitPrice: 0,  // 後で入力
                    amount: 0      // 単価入力後に計算
                });
            }
        }
    }

    return products;
}

/**
 * 商品データの合計金額を計算
 * @param {Array<Object>} products
 * @returns {number}
 */
export function calculateTotal(products) {
    return products.reduce((sum, p) => sum + (p.amount || 0), 0);
}

/**
 * 商品の金額を計算（単価 × 数量）
 * @param {Object} product
 * @returns {number}
 */
export function calculateAmount(product) {
    return (product.unitPrice || 0) * (product.quantity || 0);
}

/**
 * 抽出結果のサマリーを取得
 * @param {Array<Object>} products
 * @returns {Object}
 */
export function getExtractionSummary(products) {
    return {
        productCount: products.length,
        totalQuantity: products.reduce((sum, p) => sum + p.quantity, 0),
        hasPrices: products.every(p => p.unitPrice > 0),
        totalAmount: calculateTotal(products)
    };
}
