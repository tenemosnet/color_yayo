/**
 * config.js - アプリケーション設定
 * ver 3.4 - 基本動作修正完了版
 */

// アプリケーション設定
export const APP_VERSION = "3.4";
export const STORAGE_KEY = "yayoiCustomersData";

// 商品名称マッピング（カラーミー→弥生販売）
export const productNameMap = {
    '1364': 'Ag・uA(ｱｸﾞｱ)100mlｽﾌﾟﾚｰﾎﾞﾄﾙ',
    '1365': 'きのこの酵素水100mlｽﾌﾟﾚｰﾎﾞﾄﾙ',
    '1366': 'お米と大豆の酵素水100mlｽﾌﾟﾚｰﾎﾞﾄﾙ',
    '1369': 'Ag・uAアグア650mlパック(酵素水)',
    '1396': '遮光スプレー200ml(トリガーヘッド) 空容器'
};

// セット商品定義
export const setProducts = {
    '1229': [
        { code: '1221', name: 'ビダウォーターソープ詰替用(400ml)', price: 2420 },
        { code: '1224', name: '泡ポンプ400ml空容器', price: 800 }
    ],
    '1378': [
        { code: '1369', name: 'Ag・uAアグア650mlパック(酵素水)', price: 2530 },
        { code: '1396', name: '遮光スプレー200ml(トリガーヘッド) 空容器', price: 800 }
    ],
    '1379': [
        { code: '1393', name: 'お米と大豆の酵素水650mlパック', price: 2530 },
        { code: '1396', name: '遮光スプレー200ml(トリガーヘッド) 空容器', price: 800 }
    ],
    '1227': [
        { code: '1226', name: 'ビダウォーターソープ200ml', price: 1980 },
        { code: '1221', name: 'ビダウォーターソープ詰替用(400ml)', price: 2420 },
        { code: '1228', name: 'ビダソープセット割引', price: -100 }
    ]
};

// 送料設定（都道府県別）
export const shippingCodes = {
    '北海道': '0013',
    '青森県': '0011',
    '岩手県': '0011',
    '宮城県': '0011',
    '秋田県': '0011',
    '山形県': '0011',
    '福島県': '0011',
    '茨城県': '0010',
    '栃木県': '0010',
    '群馬県': '0010',
    '埼玉県': '0010',
    '千葉県': '0010',
    '東京都': '0010',
    '神奈川県': '0010',
    '新潟県': '0010',
    '富山県': '0010',
    '石川県': '0010',
    '福井県': '0010',
    '山梨県': '0010',
    '長野県': '0010',
    '岐阜県': '0010',
    '静岡県': '0010',
    '愛知県': '0010',
    '三重県': '0011',
    '滋賀県': '0011',
    '京都府': '0011',
    '大阪府': '0011',
    '兵庫県': '0011',
    '奈良県': '0011',
    '和歌山県': '0011',
    '鳥取県': '0012',
    '島根県': '0012',
    '岡山県': '0012',
    '広島県': '0012',
    '山口県': '0012',
    '徳島県': '0012',
    '香川県': '0012',
    '愛媛県': '0012',
    '高知県': '0012',
    '福岡県': '0013',
    '佐賀県': '0013',
    '長崎県': '0013',
    '熊本県': '0013',
    '大分県': '0013',
    '宮崎県': '0013',
    '鹿児島県': '0013',
    '沖縄県': '0014'
};

// 代引き手数料テーブル
export function calculateCODFee(paymentTotal) {
    if (paymentTotal < 10000) {
        return 330;
    } else if (paymentTotal < 30000) {
        return 440;
    } else if (paymentTotal < 100000) {
        return 660;
    } else {
        return 1100;
    }
}

// 弥生販売フォーマット設定
export const YAYOI_FORMAT = {
    FIELD_COUNT: 59,
    DELIMITER: '\t',
    LINE_BREAK: '\r\n',
    ENCODING: 'Shift_JIS',
    DEFAULT_TANTOSHA_CODE: '11',
    DEFAULT_NOUNYU_CODE_BANK: '003',
    DEFAULT_NOUNYU_CODE_COD: '001',
    SHIPPING_PRODUCT_NAME: '送料',
    COD_FEE_PRODUCT_CODE: '0002',
    COD_FEE_PRODUCT_NAME: '代引き手数料',
    DISCOUNT_PRODUCT_CODE: '0110'
};
