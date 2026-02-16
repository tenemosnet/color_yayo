/**
 * registry.js - 卸売取引先レジストリ
 * 取引先ごとの設定（顧客コード、納入コード、検出パターン、ドメインマッピング）を一元管理
 * 新規取引先追加時はこのファイルにエントリを追加する
 */

/**
 * 取引先定義
 * - code: 弥生販売の得意先コード
 * - nounyuCode: 納入先コード
 * - detect: ファイル検出方法
 *   - type: 'eml' | 'pdf-text' | 'fax'
 *   - keywords: FAXの場合、OCRテキスト内の検出キーワード
 * - domain: メールドメインの先頭部分（ローマ字→日本語名の変換用）
 * - japaneseName: ドメイン検索用の日本語会社名
 */
export const VENDORS = {
    YAMAZEN: {
        code: '000034',
        nounyuCode: '020',
        detect: { type: 'eml' },
        domain: 'yamazen',
        japaneseName: '山善'
    },
    YATSUHA: {
        code: '001568',
        nounyuCode: '030',
        detect: { type: 'pdf-text' },
        domain: 'yatsuha',
        japaneseName: 'やつは'
    },
    OPTIMAL: {
        code: '000913',
        nounyuCode: '003',
        detect: {
            type: 'fax',
            keywords: ['オプティマルライフ', 'オプティマル', 'ｵﾌﾟﾃｨﾏﾙﾗｲﾌ', 'ｵﾌﾟﾃｨﾏﾙ']
        }
    },
    HIRYU: {
        code: '001564',
        nounyuCode: '030',
        detect: {
            type: 'fax',
            keywords: ['HIRYU', '飛竜', '商品卸価格表', '卸価格表', 'マナウォーター', 'ピッコロ', 'バンブー']
        }
    },
    MOTHERS_I: {
        code: '007025',
        nounyuCode: '030',
        detect: { type: 'eml' },
        domain: 'mothers-lunch',
        japaneseName: "MOTHER'S・I"
    },
    ABE_NATURAL: {
        code: '005138',
        nounyuCode: '003',
        detect: { type: 'eml' },
        domain: 'abenatural',
        japaneseName: 'アベナチュラル'
    },
    PONOMAIL: {
        code: '006146',
        nounyuCode: '002',
        detect: { type: 'eml' }
    }
};

/**
 * 顧客コードから納入先コードを取得
 * @param {string} customerCode - 得意先コード
 * @param {number} torihikiKubun - 取引区分
 * @returns {string} 納入先コード
 */
export function getNounyuCodeByCustomer(customerCode, torihikiKubun) {
    // 取引区分ベースで納入コードを決定
    if (torihikiKubun === 2) return '003';  // 現金 → ゆうちょ振込済
    if (torihikiKubun === 4) return '002';  // 都度請求 → 先行出荷

    // 取引区分1（掛売）: 山善のみ020、他は030
    if (torihikiKubun === 1) {
        if (customerCode === VENDORS.YAMAZEN.code) return '020';
        return '030';  // 月末締め
    }

    // 取引区分3（サンプル）・その他 → 空白
    return '';
}

/**
 * ドメインキーワード→日本語名のマッピングを取得
 * @returns {Object} { domain: japaneseName } のマッピング
 */
export function getDomainToNameMapping() {
    const mapping = {};
    for (const vendor of Object.values(VENDORS)) {
        if (vendor.domain && vendor.japaneseName) {
            mapping[vendor.domain] = vendor.japaneseName;
        }
    }
    return mapping;
}

/**
 * FAX取引先の顧客コードマッピングを取得
 * @returns {Object} { VENDOR_KEY: customerCode }
 */
export function getFaxCustomerCodes() {
    const codes = {};
    for (const [key, vendor] of Object.entries(VENDORS)) {
        if (vendor.detect.type === 'fax') {
            codes[key] = vendor.code;
        }
    }
    return codes;
}
