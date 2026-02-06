/**
 * text-parser.js - メール本文から商品データを抽出
 * コード付き形式（山善等）と商品名ベース形式（マザーズアイ等）に対応
 */
import { searchProductsByText } from '../../common/product-master.js';

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
    const productPattern = /^(\d{4})\s+(.+?)[　\s]+([０-９\d]+)\s*(本|個|台|ケ|ヶ|セット|箱|袋|パック|ロット)?$/;

    // 注文数量の単位（個、本、台等）— 容量単位（ℓ等）は含めない
    const orderUnits = '個|本|台|ケ|ヶ|セット|箱|袋|パック|ロット';
    // 注文数量パターン: 行末近くに「数字+注文単位」があるものを優先的に拾う
    const orderQuantityPattern = new RegExp(`([０-９\\d]+)\\s*(${orderUnits})`, 'g');

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // まず4桁コード付きパターンを試行
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
                    unitPrice: 0,
                    amount: 0
                });
            }
            continue;
        }

        // コードなし: 行内に「数字+注文単位（個/本等）」があれば注文行とみなす
        const quantityMatches = [...trimmedLine.matchAll(orderQuantityPattern)];
        if (quantityMatches.length > 0) {
            // 最後の注文単位マッチを数量として使用（容量表記を避ける）
            const lastMatch = quantityMatches[quantityMatches.length - 1];
            const quantityStr = zenToHan(lastMatch[1]);
            const quantity = parseInt(quantityStr, 10);
            const unit = lastMatch[2] || '';
            // 数量部分を除いた行全体を商品名として使用
            // 注文メール定型句を除去してキーワードを抽出しやすくする
            const rawName = trimmedLine
                .replace(lastMatch[0], '')
                .replace(/(?:^|、\s*)(それから|また|あと|なお|ついでに)\s*/g, '')
                .replace(/も?お願いし?[たまいすで。]*。?/g, '')
                .replace(/も?注文し?[たまいすで。]*。?/g, '')
                .replace(/ください。?/g, '')
                .replace(/[以上よろしく。、]+$/g, '')
                .replace(/[　\s]+/g, ' ')
                .trim();

            if (!isNaN(quantity) && quantity > 0 && rawName.length >= 2) {
                // 商品マスタからキーワード検索
                const searchResults = searchProductsByText(rawName);
                console.log(`商品名検索: "${rawName}" → ${searchResults.length}件マッチ`, searchResults.slice(0, 3));

                if (searchResults.length === 1) {
                    // 一意にマッチ
                    products.push({
                        code: searchResults[0].code,
                        name: searchResults[0].name,
                        quantity: quantity,
                        unit: unit,
                        unitPrice: 0,
                        amount: 0
                    });
                } else {
                    // 未マッチまたは複数マッチ → 原文のまま（手動修正用）
                    products.push({
                        code: searchResults.length > 0 ? searchResults[0].code : '',
                        name: rawName + (searchResults.length > 1 ? ` [候補${searchResults.length}件]` : ''),
                        quantity: quantity,
                        unit: unit,
                        unitPrice: 0,
                        amount: 0,
                        candidates: searchResults.length > 1 ? searchResults : undefined
                    });
                }
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
