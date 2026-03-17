/**
 * formrun-parser.js - formrunエントリーフォームEML解析モジュール
 * 卸販売店エントリーフォームのメール本文から顧客情報を抽出し、
 * 弥生販売の得意先台帳インポート形式（48フィールド）を生成する
 */

import { toHalfWidthKatakana } from '../../common/kana-utils.js';

/**
 * formrunエントリーフォームのメール本文から顧客情報を抽出
 * @param {string} body - デコード済みメール本文
 * @returns {Object} 抽出された顧客情報
 */
export function parseFormrunEntry(body) {
    const fields = extractFieldValues(body);

    const repLast = fields.get('代表者名/姓') || '';
    const repFirst = fields.get('代表者名/名') || '';
    const representative = `${repLast} ${repFirst}`.trim();

    // 購買担当者名の抽出（代表者名の後に出現する「購買担当者名/姓」「購買担当者名/名」）
    const buyerLast = fields.get('購買担当者名/姓') || '';
    const buyerFirst = fields.get('購買担当者名/名') || '';
    const buyerFull = `${buyerLast} ${buyerFirst}`.trim();

    // 購買担当者が代表者と同じならメモ不要
    const buyer = (buyerFull && buyerFull !== representative) ? buyerFull : '';

    const building = cleanAnswer(fields.get('住所 (建物名)') || '');

    return {
        companyName: fields.get('法名・会社名') || '',
        furigana: fields.get('（フリガナ）') || '',
        representative,
        repLastName: repLast,
        repFirstName: repFirst,
        buyer,
        zip: (fields.get('住所 (郵便番号)') || '').replace(/-/g, ''),
        prefecture: fields.get('住所 (都道府県)') || '',
        city: fields.get('住所 (市区町村)') || '',
        address: fields.get('住所 (番地)') || '',
        building,
        email: cleanAnswer(fields.get('メールアドレス') || ''),
        phone: cleanAnswer(fields.get('会社代表番号') || ''),
        buyerPhone: cleanAnswer(fields.get('担当者　電話番号') || fields.get('担当者 電話番号') || ''),
        buyerEmail: cleanAnswer(fields.get('担当者　メールアドレス') || fields.get('担当者 メールアドレス') || ''),
        products: cleanAnswer(fields.get('取扱予定商品') || ''),
    };
}

/**
 * メール本文からフィールド名と値のペアを抽出
 * formrunのtext/plain形式: "ラベル\n値\n\nラベル\n値" のパターン
 * @param {string} body
 * @returns {Map<string, string>}
 */
function extractFieldValues(body) {
    const fields = new Map();

    // 本文から顧客情報部分を切り出し
    // 開始: 「法名・会社名」ラベル
    // 終了: 「ログインして確認する」または formrun のフッター
    const startIdx = body.indexOf('法名・会社名');
    const endMarkers = ['ログインして確認する', 'Powered by'];
    let endIdx = body.length;
    for (const marker of endMarkers) {
        const idx = body.indexOf(marker);
        if (idx !== -1 && idx < endIdx) endIdx = idx;
    }

    if (startIdx === -1) return fields;

    const section = body.substring(startIdx, endIdx).trim();

    // 空行で区切られたブロックに分割
    const blocks = section.split(/\r?\n\r?\n/);

    // 既知のフィールドラベルパターン
    const knownLabels = [
        '法名・会社名', '（フリガナ）',
        '代表者名/姓', '代表者名/名',
        '名前（フリガナ）/セイ', '名前（フリガナ）/メイ',
        '購買担当者名/姓', '購買担当者名/名',
        '設立',
        '住所 (郵便番号)', '住所 (都道府県)', '住所 (市区町村)', '住所 (番地)', '住所 (建物名)',
        'ホームページURL',
        'メールアドレス',
        '会社代表番号',
        '担当者　電話番号', '担当者 電話番号',
        '担当者　メールアドレス', '担当者 メールアドレス',
        '取扱予定商品',
        '業務内容と販売予定の方法', '業務内容が分かる資料',
    ];

    // 購買担当者のフリガナを区別するためのコンテキスト追跡
    let seenRepFuriganaSei = false;
    let seenRepFuriganaMei = false;

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i].trim();
        if (!block) continue;

        const lines = block.split(/\r?\n/);
        const label = lines[0].trim();
        const value = lines.slice(1).join('\n').trim();

        // 「名前（フリガナ）/セイ」「名前（フリガナ）/メイ」は
        // 代表者と購買担当者で2回出現する
        if (label === '名前（フリガナ）/セイ') {
            if (!seenRepFuriganaSei) {
                fields.set('代表者フリガナ/セイ', value);
                seenRepFuriganaSei = true;
            } else {
                fields.set('購買担当者フリガナ/セイ', value);
            }
            continue;
        }
        if (label === '名前（フリガナ）/メイ') {
            if (!seenRepFuriganaMei) {
                fields.set('代表者フリガナ/メイ', value);
                seenRepFuriganaMei = true;
            } else {
                fields.set('購買担当者フリガナ/メイ', value);
            }
            continue;
        }

        // 既知ラベルの部分一致（「業務内容と販売予定の方法（ホームページ、実店舗など）」等の長い名称対応）
        const matchedLabel = knownLabels.find(l => label.startsWith(l));
        if (matchedLabel) {
            // 値が次のブロックにある場合（ラベルのみの行）
            if (value) {
                fields.set(matchedLabel, value);
            } else if (i + 1 < blocks.length) {
                // ラベルのみのブロックの場合、次ブロックが値かもしれないが
                // formrun形式では同一ブロック内に値がある
                fields.set(matchedLabel, '');
            }
        }
    }

    return fields;
}

/**
 * 「回答なし」を空文字に変換
 * @param {string} value
 * @returns {string}
 */
function cleanAnswer(value) {
    return value === '回答なし' ? '' : value;
}

/**
 * メールがformrunエントリーフォームかどうかを判定
 * @param {string} body - デコード済みメール本文
 * @param {string} subject - 件名
 * @returns {boolean}
 */
export function isFormrunEntry(body, subject) {
    if (subject && subject.includes('エントリーフォーム')) return true;
    if (body && body.includes('法名・会社名') && body.includes('代表者名')) return true;
    return false;
}

/**
 * 弥生販売の得意先台帳インポート形式（48フィールド・タブ区切り）を生成
 * @param {Object} customer - parseFormrunEntry() の戻り値
 * @param {string} code - 得意先コード（手入力）
 * @returns {string} タブ区切り1行（CRLFなし）
 */
export function generateCustomerTXT(customer, code) {
    const address1 = `${customer.prefecture}${customer.city}${customer.address}`.trim();
    const address2 = customer.building || '';

    // 購買担当者をメモ1に（代表者と異なる場合のみ）
    const memo1 = customer.buyer ? `購買担当: ${customer.buyer}` : '';

    const row = [
        String(code).padStart(6, '0'),                     // 0: コード（6桁ゼロ埋め）
        customer.companyName,                            // 1: 名称
        toHalfWidthKatakana(customer.furigana),          // 2: フリガナ（半角カタカナ）
        customer.companyName,                            // 3: 略称
        customer.zip.replace(/-/g, ''),                  // 4: 郵便番号（7桁）
        address1,                                        // 5: 住所１
        address2,                                        // 6: 住所２
        '',                                              // 7: 部署名
        '',                                              // 8: 役職名
        customer.representative,                         // 9: 担当者（代表者名）
        '様',                                            // 10: 敬称
        customer.phone,                                  // 11: TEL
        '',                                              // 12: FAX
        '',                                              // 13: 携帯
        memo1,                                           // 14: メモ1（購買担当者）
        '',                                              // 15: メモ2
        '',                                              // 16: メモ3
        '',                                              // 17: 銀行名
        '',                                              // 18: 支店名
        '30060100',                                      // 19: 指定売上伝票
        '',                                              // 20: 口座番号
        '',                                              // 21: 口座名義
        '2',                                             // 22: 取引区分（2=現金）
        '3',                                             // 23: 単価種類（3=売上単価２）
        '100',                                           // 24: 掛率
        '',                                              // 25: 与信限度額
        '',                                              // 26: 税率
        '5',                                             // 27: 税転嫁（5固定）
        '',                                              // 28: 請求締日
        '1',                                             // 29: 回収サイクル（1固定）
        '',                                              // 30: 回収日
        '1',                                             // 31: 手数料負担区分（1固定）
        '',                                              // 32: 請求書発行単位
        '',                                              // 33: 金額端数処理単位
        '1',                                             // 34: 金額端数処理（1固定）
        '1',                                             // 35: 税端数処理（1固定）
        '11',                                            // 36: 担当者コード（11固定）
        '',                                              // 37: ホームページ
        customer.email,                                  // 38: メールアドレス
        '',                                              // 39: 参照先
        '1',                                             // 40: 参照表示（1固定）
        '',                                              // 41: 出力先
        '1',                                             // 42: 出力方法（1固定）
        '',                                              // 43: ユーザー定義1
        '',                                              // 44: ユーザー定義2
        '',                                              // 45: ユーザー定義3
        '',                                              // 46: ユーザー定義4
        ''                                               // 47: ユーザー定義5
    ];

    return row.join('\t');
}
