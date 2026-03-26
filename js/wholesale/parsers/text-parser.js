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
 * メール本文から引用返信を除去
 * Gmail/Outlook等の引用ヘッダー行以降を切り捨て、「>」プレフィックス行をスキップ
 * @param {Array<string>} lines - メール本文の行配列
 * @returns {Array<string>} 引用除去済みの行配列
 */
export function stripQuotedReplies(lines) {
    const quoteHeaderPatterns = [
        /^\d{4}年\d{1,2}月\d{1,2}日/,              // Gmail日本語: "2025年2月25日(火) 10:42 ..."
        /^On \d{4}\/\d{1,2}\/\d{1,2}/,              // Gmail英語: "On 2025/02/24 23:25, ..."
        /^-{3,}\s*(Original Message|元のメッセージ)/  // Outlook/Thunderbird
    ];
    const result = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (quoteHeaderPatterns.some(p => p.test(trimmed))) break;
        if (/^>/.test(trimmed)) continue;
        result.push(line);
    }
    return result;
}

/**
 * メール本文から商品データを抽出
 * @param {string} emailBody - メール本文
 * @returns {Array<Object>} [{ code, name, quantity, unit, unitPrice, amount }, ...]
 */
export function extractProductData(emailBody) {
    const products = [];
    const lines = stripQuotedReplies(emailBody.split(/\r?\n/));

    // 商品行のパターン: 4桁コード + 商品名 + 数量 + 単位
    // 例: "1110 ノーマルレフィル　２４個"
    // 例: "1374 ペットアグア1リットル　１２本"
    // 注: キロは重量仕様（20キロ袋等）のため注文単位に含めない
    const productPattern = /^(\d{4})\s+(.+?)[　\s]+([０-９\d]+)\s*(本|個|台|ケ|ヶ|ケース|セット|箱|袋|パック|ロット|冊)?$/;

    // 注文数量の単位（個、本、台等）— 容量単位（ℓ等）・重量単位（キロ等）は含めない
    const orderUnits = '個|本|台|ケ|ヶ|ケース|セット|箱|袋|パック|ロット|冊';

    // フォールバック: コード付き行で認識可能な数量がないもの（例: "1711 ボリビア岩塩 20キロ"）
    const codeFallbackPattern = /^(\d{4})\s+(.+)$/;
    // 注文数量パターン: 行末近くに「数字+注文単位」があるものを優先的に拾う
    const orderQuantityPattern = new RegExp(`([０-９\\d]+)\\s*(${orderUnits})`, 'g');
    // 乗算記号パターン: ✖︎1、×2、✕3、x4 等（単位なし数量）
    // ✖︎ = U+2716 + U+FE0E(variation selector)、× = U+00D7、✕ = U+2715
    const multiplyQuantityPattern = /[✖✕×xX]\uFE0E?\s*([０-９\d]+)\s*$/;

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

        // フォールバック: コード付きだが数量・単位がない行 → 数量1で登録
        // 例: "1711 ボリビア岩塩 20キロ"（20キロは商品仕様、数量は1）
        const codeFallback = trimmedLine.match(codeFallbackPattern);
        if (codeFallback) {
            products.push({
                code: codeFallback[1],
                name: codeFallback[2].trim(),
                quantity: 1,
                unit: '',
                unitPrice: 0,
                amount: 0
            });
            continue;
        }

        // コードなし: 乗算記号パターン（✖︎1、×2等）を先にチェック
        // 「マナウォーター(中)ステンレス✖︎1」のように単位なしで数量を表す形式
        const multiplyMatch = trimmedLine.match(multiplyQuantityPattern);
        if (multiplyMatch) {
            const quantityStr = zenToHan(multiplyMatch[1]);
            const quantity = parseInt(quantityStr, 10);
            // 乗算記号より前を商品名として抽出
            const rawName = trimmedLine
                .replace(multiplyQuantityPattern, '')
                .replace(/(?:^|、\s*)(それから|また|あと|なお|ついでに)\s*/g, '')
                .replace(/も?お願いし?[たまいすで。]*。?/g, '')
                .replace(/も?注文し?[たまいすで。]*。?/g, '')
                .replace(/ください。?/g, '')
                .replace(/[以上よろしく。、]+$/g, '')
                .replace(/[　\s]+/g, ' ')
                .trim();

            if (!isNaN(quantity) && quantity > 0 && rawName.length >= 2) {
                let searchResults = searchProductsByText(rawName);
                console.log(`商品名検索(乗算): "${rawName}" → ${searchResults.length}件マッチ`, searchResults.slice(0, 3));

                if (searchResults.length === 1) {
                    products.push({
                        code: searchResults[0].code,
                        name: searchResults[0].name,
                        quantity: quantity,
                        unit: '',
                        unitPrice: 0,
                        amount: 0
                    });
                } else {
                    products.push({
                        code: searchResults.length > 0 ? searchResults[0].code : '',
                        name: rawName + (searchResults.length > 1 ? ` [候補${searchResults.length}件]` : ''),
                        quantity: quantity,
                        unit: '',
                        unitPrice: 0,
                        amount: 0,
                        candidates: searchResults.length > 1 ? searchResults : undefined
                    });
                }
                continue;
            }
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
                let searchResults = searchProductsByText(rawName);
                console.log(`商品名検索: "${rawName}" → ${searchResults.length}件マッチ`, searchResults.slice(0, 3));

                // フォールバック: 末尾の「本」（書籍の意味）を除去して再検索
                // 例: 「フリーエネルギー本」→「フリーエネルギー」
                if (searchResults.length === 0 && rawName.endsWith('本') && rawName.length > 2) {
                    const strippedName = rawName.slice(0, -1);
                    searchResults = searchProductsByText(strippedName);
                    console.log(`商品名検索(本除去): "${strippedName}" → ${searchResults.length}件マッチ`, searchResults.slice(0, 3));
                }

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
