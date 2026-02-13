/**
 * bank-matcher.js - ゆうちょ入金データと受注リストの照合ロジック
 *
 * 照合結果:
 *   'confirmed' — 金額+名前一致（入金確認済）
 *   'candidate' — 金額のみ一致（候補）
 *   null        — 不一致
 */

/**
 * 全角カタカナを半角カタカナに変換
 */
const FULL_TO_HALF_KANA = {
    'ガ': 'ｶﾞ', 'ギ': 'ｷﾞ', 'グ': 'ｸﾞ', 'ゲ': 'ｹﾞ', 'ゴ': 'ｺﾞ',
    'ザ': 'ｻﾞ', 'ジ': 'ｼﾞ', 'ズ': 'ｽﾞ', 'ゼ': 'ｾﾞ', 'ゾ': 'ｿﾞ',
    'ダ': 'ﾀﾞ', 'ヂ': 'ﾁﾞ', 'ヅ': 'ﾂﾞ', 'デ': 'ﾃﾞ', 'ド': 'ﾄﾞ',
    'バ': 'ﾊﾞ', 'ビ': 'ﾋﾞ', 'ブ': 'ﾌﾞ', 'ベ': 'ﾍﾞ', 'ボ': 'ﾎﾞ',
    'パ': 'ﾊﾟ', 'ピ': 'ﾋﾟ', 'プ': 'ﾌﾟ', 'ペ': 'ﾍﾟ', 'ポ': 'ﾎﾟ',
    'ヴ': 'ｳﾞ',
    'ア': 'ｱ', 'イ': 'ｲ', 'ウ': 'ｳ', 'エ': 'ｴ', 'オ': 'ｵ',
    'カ': 'ｶ', 'キ': 'ｷ', 'ク': 'ｸ', 'ケ': 'ｹ', 'コ': 'ｺ',
    'サ': 'ｻ', 'シ': 'ｼ', 'ス': 'ｽ', 'セ': 'ｾ', 'ソ': 'ｿ',
    'タ': 'ﾀ', 'チ': 'ﾁ', 'ツ': 'ﾂ', 'テ': 'ﾃ', 'ト': 'ﾄ',
    'ナ': 'ﾅ', 'ニ': 'ﾆ', 'ヌ': 'ﾇ', 'ネ': 'ﾈ', 'ノ': 'ﾉ',
    'ハ': 'ﾊ', 'ヒ': 'ﾋ', 'フ': 'ﾌ', 'ヘ': 'ﾍ', 'ホ': 'ﾎ',
    'マ': 'ﾏ', 'ミ': 'ﾐ', 'ム': 'ﾑ', 'メ': 'ﾒ', 'モ': 'ﾓ',
    'ヤ': 'ﾔ', 'ユ': 'ﾕ', 'ヨ': 'ﾖ',
    'ラ': 'ﾗ', 'リ': 'ﾘ', 'ル': 'ﾙ', 'レ': 'ﾚ', 'ロ': 'ﾛ',
    'ワ': 'ﾜ', 'ヲ': 'ｦ', 'ン': 'ﾝ',
    'ァ': 'ｧ', 'ィ': 'ｨ', 'ゥ': 'ｩ', 'ェ': 'ｪ', 'ォ': 'ｫ',
    'ッ': 'ｯ', 'ャ': 'ｬ', 'ュ': 'ｭ', 'ョ': 'ｮ',
    'ー': 'ｰ'
};

/**
 * 名前を正規化（スペース除去、全角→半角カナ変換）
 * @param {string} name
 * @returns {string} 正規化された名前
 */
export function normalizeName(name) {
    if (!name) return '';
    // 全角カタカナ→半角カタカナ変換
    let result = '';
    for (const char of name) {
        result += FULL_TO_HALF_KANA[char] || char;
    }
    // 小文字カナを大文字カナに統一（銀行振込では大文字表記が一般的）
    const smallToLarge = { 'ｧ': 'ｱ', 'ｨ': 'ｲ', 'ｩ': 'ｳ', 'ｪ': 'ｴ', 'ｫ': 'ｵ', 'ｯ': 'ﾂ', 'ｬ': 'ﾔ', 'ｭ': 'ﾕ', 'ｮ': 'ﾖ' };
    let normalized = '';
    for (const ch of result) {
        normalized += smallToLarge[ch] || ch;
    }
    // スペース（半角・全角）除去、大文字化（英字対応）
    return normalized.replace(/[\s　]/g, '').toUpperCase();
}

/**
 * 受注の売上合計を計算（代引手数料なしの振込向け）
 * @param {Object} order - カラーミー受注データ
 * @returns {number} 売上合計
 */
function calculateOrderTotal(order) {
    const itemsTotal = order.items.reduce((sum, item) => sum + item.subtotal, 0);
    return itemsTotal + (order.shippingFee || 0) - (order.discountAmount || 0);
}

/**
 * 入金データと受注リストを照合する
 * @param {Array} deposits - ゆうちょ入金レコード配列
 * @param {Array} orders - カラーミー受注データ配列
 * @returns {Object} 照合結果 { matches: Map<orderIndex, {status, deposit}>, summary }
 */
export function matchDepositsToOrders(deposits, orders) {
    const matches = new Map(); // orderIndex → { status: 'confirmed'|'candidate', deposit }
    const usedDeposits = new Set(); // 使用済み入金レコードのインデックス

    // 各注文の合計金額を事前計算
    const orderTotals = orders.map(order => calculateOrderTotal(order));

    // Pass 1: 金額+名前の完全一致（confirmed）
    for (let oi = 0; oi < orders.length; oi++) {
        const order = orders[oi];

        // 代引きは照合対象外
        if (isCODOrder(order)) continue;

        const total = orderTotals[oi];
        const orderNameNorm = normalizeName(order.customerName);
        const orderFuriganaNorm = normalizeName(order.furigana);

        for (let di = 0; di < deposits.length; di++) {
            if (usedDeposits.has(di)) continue;

            const deposit = deposits[di];
            if (deposit.amount !== total) continue;

            // 受注日より前の入金はペアリング対象外（日付部分のみ、区切り文字を統一して比較）
            if (order.orderDate && deposit.date < order.orderDate.slice(0, 10).replace(/\//g, '-')) continue;

            const depositNameNorm = normalizeName(deposit.name);

            // 名前照合: 漢字名 or フリガナ(半角カナ化)で一致
            if (depositNameNorm === orderNameNorm ||
                depositNameNorm === orderFuriganaNorm) {
                matches.set(oi, { status: 'confirmed', deposit, depositIndex: di });
                usedDeposits.add(di);
                break;
            }
        }
    }

    // Pass 2: 金額のみ一致（candidate）— 理由を記録
    for (let oi = 0; oi < orders.length; oi++) {
        if (matches.has(oi)) continue;

        const order = orders[oi];
        if (isCODOrder(order)) continue;

        const total = orderTotals[oi];
        const orderNameNorm = normalizeName(order.customerName);
        const orderFuriganaNorm = normalizeName(order.furigana);

        for (let di = 0; di < deposits.length; di++) {
            if (usedDeposits.has(di)) continue;

            const deposit = deposits[di];
            if (deposit.amount !== total) continue;

            // 受注日より前の入金はペアリング対象外（日付部分のみ、区切り文字を統一して比較）
            if (order.orderDate && deposit.date < order.orderDate.slice(0, 10).replace(/\//g, '-')) continue;

            // 金額一致だが名前不一致 → 候補
            const depositNameNorm = normalizeName(deposit.name);
            const reasons = [];
            reasons.push('金額一致');
            if (depositNameNorm !== orderNameNorm && depositNameNorm !== orderFuriganaNorm) {
                reasons.push(`名前不一致（振込: ${deposit.name} / 受注: ${order.customerName}）`);
            }
            matches.set(oi, { status: 'candidate', deposit, depositIndex: di, reasons });
            usedDeposits.add(di);
            break;
        }
    }

    // 未照合の入金レコードを収集
    const unmatchedDeposits = deposits.filter((_, di) => !usedDeposits.has(di));

    // サマリー集計
    let confirmedCount = 0;
    let candidateCount = 0;
    matches.forEach(m => {
        if (m.status === 'confirmed') confirmedCount++;
        if (m.status === 'candidate') candidateCount++;
    });

    const nonCODCount = orders.filter(o => !isCODOrder(o)).length;

    return {
        matches,
        unmatchedDeposits,
        summary: {
            confirmed: confirmedCount,
            candidate: candidateCount,
            unmatched: nonCODCount - confirmedCount - candidateCount,
            total: nonCODCount,
            depositTotal: deposits.length,
            depositMatched: usedDeposits.size,
            depositUnmatched: unmatchedDeposits.length
        }
    };
}

/**
 * 代引き注文かどうか判定
 * @param {Object} order
 * @returns {boolean}
 */
function isCODOrder(order) {
    return order.paymentMethod.includes('代引') || (order.paymentFee > 0);
}
