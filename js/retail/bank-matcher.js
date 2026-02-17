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
 * 旧字体・異体字→新字体マッピング（人名で頻出するもの）
 */
const VARIANT_KANJI = {
    '邉': '辺', '邊': '辺',
    '髙': '高',
    '齋': '斎', '齊': '斎',
    '澤': '沢',
    '櫻': '桜',
    '國': '国',
    '廣': '広',
    '藏': '蔵',
    '濱': '浜', '濵': '浜',
    '嶋': '島', '嶌': '島',
    '﨑': '崎',
    '龍': '竜',
    '惠': '恵',
    '眞': '真',
    '實': '実',
    '壽': '寿',
    '榮': '栄',
    '豐': '豊',
    '鐵': '鉄',
    '德': '徳',
    '遙': '遥',
    '黑': '黒',
    '冨': '富',
    '條': '条',
    '繪': '絵',
    '與': '与',
    '穗': '穂',
    '峯': '峰',
    '竝': '並',
    '靜': '静',
    '圓': '円',
    '辯': '弁', '瓣': '弁', '辨': '弁',
};

/**
 * 名前を正規化（スペース除去、全角→半角カナ変換、旧字体→新字体統一）
 * @param {string} name
 * @returns {string} 正規化された名前
 */
export function normalizeName(name) {
    if (!name) return '';
    // 旧字体・異体字→新字体変換 + 全角カタカナ→半角カタカナ変換
    let result = '';
    for (const char of name) {
        const normalized = VARIANT_KANJI[char] || FULL_TO_HALF_KANA[char] || char;
        result += normalized;
    }
    // 小文字カナを大文字カナに統一（銀行振込では大文字表記が一般的）
    const smallToLarge = { 'ｧ': 'ｱ', 'ｨ': 'ｲ', 'ｩ': 'ｳ', 'ｪ': 'ｴ', 'ｫ': 'ｵ', 'ｯ': 'ﾂ', 'ｬ': 'ﾔ', 'ｭ': 'ﾕ', 'ｮ': 'ﾖ' };
    let kanaResult = '';
    for (const ch of result) {
        kanaResult += smallToLarge[ch] || ch;
    }
    // スペース（半角・全角）除去、大文字化（英字対応）
    return kanaResult.replace(/[\s　]/g, '').toUpperCase();
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
    // ※名前の類似度がゼロの場合はペアリングしない（ノンペア判定）
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

            // 金額一致だが名前不一致 → 候補（ただし名前類似度ゼロはスキップ）
            const depositNameNorm = normalizeName(deposit.name);

            // ノンペア判定: 名前に共通文字が1文字もなければスキップ
            if (!hasNameOverlap(depositNameNorm, orderNameNorm) &&
                !hasNameOverlap(depositNameNorm, orderFuriganaNorm)) {
                continue;
            }

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

    // Pass 3: 名前一致・金額不一致（amount_mismatch）— 入金額誤りの可能性
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
            // 金額が同じなら Pass 1/2 で処理済みのはず → 金額不一致のみ対象
            if (deposit.amount === total) continue;

            const depositNameNorm = normalizeName(deposit.name);

            // 名前一致（漢字名 or フリガナ）
            if (depositNameNorm === orderNameNorm ||
                depositNameNorm === orderFuriganaNorm) {
                const diff = deposit.amount - total;
                const reasons = [
                    '名前一致・金額不一致',
                    `受注額: ¥${total.toLocaleString()} / 入金額: ¥${deposit.amount.toLocaleString()}（差額: ${diff > 0 ? '+' : ''}¥${diff.toLocaleString()}）`
                ];
                matches.set(oi, { status: 'amount_mismatch', deposit, depositIndex: di, reasons });
                usedDeposits.add(di);
                break;
            }
        }
    }

    // 未照合の入金レコードを収集
    const unmatchedDeposits = deposits.filter((_, di) => !usedDeposits.has(di));

    // サマリー集計
    let confirmedCount = 0;
    let candidateCount = 0;
    let amountMismatchCount = 0;
    matches.forEach(m => {
        if (m.status === 'confirmed') confirmedCount++;
        if (m.status === 'candidate') candidateCount++;
        if (m.status === 'amount_mismatch') amountMismatchCount++;
    });

    const nonCODCount = orders.filter(o => !isCODOrder(o)).length;

    return {
        matches,
        unmatchedDeposits,
        summary: {
            confirmed: confirmedCount,
            candidate: candidateCount,
            amountMismatch: amountMismatchCount,
            unmatched: nonCODCount - confirmedCount - candidateCount - amountMismatchCount,
            total: nonCODCount,
            depositTotal: deposits.length,
            depositMatched: usedDeposits.size,
            depositUnmatched: unmatchedDeposits.length
        }
    };
}

/**
 * 2つの名前に共通する文字が4文字以上あるか判定（ノンペア判定用）
 * @param {string} a - 正規化済み名前
 * @param {string} b - 正規化済み名前
 * @returns {boolean} 共通文字が4文字以上あればtrue
 */
function hasNameOverlap(a, b) {
    if (!a || !b) return false;
    const setB = new Set(b);
    let count = 0;
    for (const ch of a) {
        if (setB.has(ch)) count++;
    }
    return count >= 4;
}

/**
 * 代引き注文かどうか判定
 * @param {Object} order
 * @returns {boolean}
 */
function isCODOrder(order) {
    return order.paymentMethod.includes('代引') || (order.paymentFee > 0);
}
