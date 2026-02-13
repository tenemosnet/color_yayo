/**
 * bank-parser.js - ゆうちょダイレクト入出金明細CSVパーサー
 *
 * ゆうちょCSV形式:
 *   ヘッダー6行 + カラム行 + データ行
 *   エンコーディング: Shift-JIS
 *   列: 取引日, 入出金明細ＩＤ, 受入金額（円）, 払出金額（円）, 詳細１, 詳細２, 現在（貸付）高
 */

const HEADER_ROWS = 7; // ヘッダー6行 + カラム名1行

/**
 * ゆうちょCSVテキストをパースし、入金レコードのみ返す
 * @param {string} csvText - UTF-8変換済みのCSVテキスト
 * @returns {Array<Object>} 入金レコード配列
 */
export function parseYuchoBankCSV(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');

    if (lines.length <= HEADER_ROWS) {
        return [];
    }

    const dataLines = lines.slice(HEADER_ROWS);
    const deposits = [];

    for (const line of dataLines) {
        const cols = line.split(',');
        if (cols.length < 7) continue;

        const date = cols[0].trim();
        const depositAmount = cols[2].trim();
        const detail1 = cols[4].trim();
        const detail2 = cols[5].trim();

        // 受入金額がある行のみ（入金）
        if (!depositAmount) continue;

        const amount = parseInt(depositAmount, 10);
        if (isNaN(amount) || amount <= 0) continue;

        // 振込人名がない入金（通帳入金等）は照合不要なので除外
        if (!detail2) continue;

        // 取引日をYYYY-MM-DD形式に変換
        const formattedDate = formatDate(date);

        deposits.push({
            date: formattedDate,
            amount: amount,
            type: detail1,       // 振込, 送金, 送金 等
            name: detail2,       // 振込人名（半角カナ or 漢字）
        });
    }

    return deposits;
}

/**
 * 取引日(YYYYMMDD)をYYYY-MM-DD形式に変換
 * @param {string} dateStr - YYYYMMDD形式の日付文字列
 * @returns {string} YYYY-MM-DD形式
 */
function formatDate(dateStr) {
    if (dateStr.length === 8) {
        return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
    }
    return dateStr;
}

/**
 * Shift-JIS ArrayBufferをUTF-8テキストに変換
 * @param {ArrayBuffer} buffer - Shift-JISエンコードされたバッファ
 * @returns {string} UTF-8テキスト
 */
export function decodeShiftJIS(buffer) {
    const decoder = new TextDecoder('shift-jis');
    return decoder.decode(buffer);
}
