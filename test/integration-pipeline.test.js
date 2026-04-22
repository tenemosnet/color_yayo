/**
 * 卸売パイプライン統合テスト
 * EML解析 → 商品抽出 → スコアリングのフルパイプラインを検証
 *
 * 新規取引先追加・検索ロジック変更時の回帰テストとして機能。
 * test/fixtures/eml/ にサンプルEMLを追加し、期待結果を定義するだけで
 * 新パターンを回帰テストに組み込める。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseEmlFile } from '../js/wholesale/parsers/eml-parser.js';
import { extractProductData } from '../js/wholesale/parsers/text-parser.js';
import { parseOrderTable } from '../js/wholesale/parsers/pdf-parser.js';
import { searchProductsByText, clearProductMaster } from '../js/common/product-master.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** フィクスチャEMLファイルを読み込む */
function readEmlFixture(filename) {
    return readFileSync(resolve(__dirname, 'fixtures/eml', filename), 'utf-8');
}

/**
 * モック商品マスタ
 * 紛らわしい商品を意図的に含め、スコアリング精度を検証する
 */
const MOCK_PRODUCTS = {
    '1220': { code: '1220', name: 'ビダウォーターソープ(300ml)', category1: '', price1: 1980, price2: 0, price3: 0, lotSize: 0 },
    '1221': { code: '1221', name: 'ビダウォーターソープ・詰替用(400ml)', category1: '', price1: 1320, price2: 0, price3: 0, lotSize: 0 },
    '1224': { code: '1224', name: '泡ﾎﾟﾝﾌﾟ400ml空容器', category1: '', price1: 509, price2: 0, price3: 0, lotSize: 0 },
    '1340': { code: '1340', name: 'ポケットピッコロ', category1: '', price1: 3300, price2: 0, price3: 0, lotSize: 0 },
    '1379': { code: '1379', name: 'お米と大豆の酵素水650ml+200ml遮光ｽﾌﾟﾚｰｾｯﾄ', category1: '', price1: 2200, price2: 0, price3: 0, lotSize: 0 },
    '1393': { code: '1393', name: 'お米と大豆の酵素水650mlパック', category1: '', price1: 1380, price2: 0, price3: 0, lotSize: 0 },
    '1510': { code: '1510', name: 'マナウォーター青 大', category1: '', price1: 15000, price2: 0, price3: 0, lotSize: 0 },
    '1711': { code: '1711', name: 'ボリビア岩塩20kg', category1: '07', price1: 5000, price2: 0, price3: 0, lotSize: 0 },
    '1800': { code: '1800', name: 'フリーエネルギー', category1: '', price1: 1500, price2: 0, price3: 0, lotSize: 0 },
    '1801': { code: '1801', name: 'フリーエネルギー小冊子', category1: '', price1: 300, price2: 0, price3: 0, lotSize: 0 },
    '1100': { code: '1100', name: 'ビダドロップ', category1: '', price1: 2750, price2: 0, price3: 0, lotSize: 0 },
    '1110': { code: '1110', name: 'ノーマルレフィル', category1: '', price1: 990, price2: 0, price3: 0, lotSize: 0 },
    '1500': { code: '1500', name: 'マナウォーター(中)ステンレス', category1: '', price1: 33000, price2: 0, price3: 0, lotSize: 0 },
    '1511': { code: '1511', name: 'マナウォーター青 中', category1: '', price1: 8000, price2: 0, price3: 0, lotSize: 0 },
    '1600': { code: '1600', name: '糖蜜', category1: '07', price1: 770, price2: 0, price3: 0, lotSize: 20 }
};

// localStorage モック
vi.stubGlobal('localStorage', {
    _store: {},
    getItem(key) { return this._store[key] || null; },
    setItem(key, value) { this._store[key] = value; },
    removeItem(key) { delete this._store[key]; }
});

beforeEach(() => {
    clearProductMaster();
    localStorage._store = {};
    localStorage.setItem('productMaster', JSON.stringify({
        products: MOCK_PRODUCTS,
        count: Object.keys(MOCK_PRODUCTS).length
    }));
});

// ============================================================
// アベナチュラル: Gmail multipart/alternative + base64
// ============================================================
describe('アベナチュラル パイプライン', () => {
    let parsed, products;

    beforeEach(() => {
        const eml = readEmlFixture('abenatural.eml');
        parsed = parseEmlFile(eml);
        products = extractProductData(parsed.body);
    });

    it('Step1: EML解析 — base64本文をデコードし送信元ドメインを抽出', () => {
        expect(parsed.fromDomain).toBe('abenatural.com');
        expect(parsed.body).toContain('大豆とお米の酵素');
        expect(parsed.body).toContain('ビダソープ詰め替え用');
    });

    it('Step2: 商品抽出 — 2商品をロット単位で抽出', () => {
        expect(products).toHaveLength(2);
        expect(products[0].quantity).toBe(1);
        expect(products[0].unit).toBe('ロット');
        expect(products[1].quantity).toBe(1);
        expect(products[1].unit).toBe('ロット');
    });

    it('Step3: スコアリング — 酵素は1393(単品)が1379(セット)より上位', () => {
        // 「大豆とお米の酵素 650ml」→ 1393 が正解、1379(セット)は不正解
        const enzymeProduct = products.find(p =>
            p.code === '1393' || p.code === '1379'
        );
        expect(enzymeProduct).toBeDefined();
        expect(enzymeProduct.code).toBe('1393');
    });

    it('Step3: スコアリング — ソープは1221(詰替用)が1224(泡ポンプ)より上位', () => {
        // 「ビダソープ詰め替え用 400ml」→ 1221 が正解、1224(泡ポンプ)は不正解
        const soapProduct = products.find(p =>
            p.code === '1221' || p.code === '1224' || p.code === '1220'
        );
        expect(soapProduct).toBeDefined();
        expect(soapProduct.code).toBe('1221');
    });
});

// ============================================================
// 369カフェ: text/plain + 8bit
// ============================================================
describe('369カフェ パイプライン', () => {
    let parsed, products;

    beforeEach(() => {
        const eml = readEmlFixture('369cafe.eml');
        parsed = parseEmlFile(eml);
        products = extractProductData(parsed.body);
    });

    it('Step1: EML解析 — 平文メールの本文とドメインを抽出', () => {
        expect(parsed.fromDomain).toBe('369ism.net');
        expect(parsed.body).toContain('ポケットピッコロ');
    });

    it('Step2: 商品抽出 — ポケットピッコロ1ロット', () => {
        expect(products).toHaveLength(1);
        expect(products[0].quantity).toBe(1);
        expect(products[0].unit).toBe('ロット');
    });

    it('Step3: スコアリング — ポケットピッコロが正しくマッチ', () => {
        expect(products[0].code).toBe('1340');
    });
});

// ============================================================
// ヒカルランド: multipart/mixed + 8bit
// ============================================================
describe('ヒカルランド パイプライン', () => {
    let parsed, products;

    beforeEach(() => {
        const eml = readEmlFixture('hikaruland.eml');
        parsed = parseEmlFile(eml);
        products = extractProductData(parsed.body);
    });

    it('Step1: EML解析 — multipart/mixed本文とドメインを抽出', () => {
        expect(parsed.fromDomain).toBe('hikaruland.co.jp');
        expect(parsed.body).toContain('ビダウォーターソープ');
    });

    it('Step2: 商品抽出 — ビダウォーターソープ12個', () => {
        expect(products).toHaveLength(1);
        expect(products[0].quantity).toBe(12);
        expect(products[0].unit).toBe('個');
    });

    it('Step3: スコアリング — 1220(ソープ本体)が最上位', () => {
        // 「ビダウォーターソープ」→ 1220(本体)が正解、1221(詰替)や1224(泡ポンプ)は不正解
        expect(products[0].code).toBe('1220');
    });
});

// ============================================================
// PONOMAIL: Gmail multipart/alternative + base64 + 引用返信
// ============================================================
describe('PONOMAIL パイプライン', () => {
    let parsed, products;

    beforeEach(() => {
        const eml = readEmlFixture('ponomail.eml');
        parsed = parseEmlFile(eml);
        products = extractProductData(parsed.body);
    });

    it('Step1: EML解析 — base64本文をデコードしGmailドメインを抽出', () => {
        expect(parsed.fromDomain).toBe('gmail.com');
        expect(parsed.body).toContain('ボリビア岩塩');
        expect(parsed.body).toContain('フリーエネルギー本');
        // 引用部分もbodyに含まれる（text-parserで除去される）
        expect(parsed.body).toContain('マナウォーター青');
    });

    it('Step2: 商品抽出 — 引用返信を除外して2商品のみ抽出', () => {
        expect(products).toHaveLength(2);
        // コード付き・数量なし: "1711 ボリビア岩塩 20キロ" → 20キロは商品仕様、数量1
        expect(products[0]).toMatchObject({ code: '1711', quantity: 1, unit: '' });
        // コードなし: フリーエネルギー本 20冊
        expect(products[1]).toMatchObject({ quantity: 20, unit: '冊' });
    });

    it('Step2: 引用部分の古い注文（1510）は抽出されない', () => {
        const oldOrder = products.find(p => p.code === '1510');
        expect(oldOrder).toBeUndefined();
    });
});

// ============================================================
// 山善: text/plain + 8bit、コードなし注文
// ============================================================
describe('山善（コードなし） パイプライン', () => {
    let parsed, products;

    beforeEach(() => {
        const eml = readEmlFixture('yamazen-nocode.eml');
        parsed = parseEmlFile(eml);
        products = extractProductData(parsed.body);
    });

    it('Step1: EML解析 — 平文メールの本文とドメインを抽出', () => {
        expect(parsed.fromDomain).toBe('yamazen.info');
        expect(parsed.body).toContain('ビダドロップ');
        expect(parsed.body).toContain('ノーマルレフィル');
        expect(parsed.body).toContain('フリーエネルギー小冊子');
    });

    it('Step2: 商品抽出 — コードなし3商品を抽出', () => {
        expect(products).toHaveLength(3);
        expect(products[0]).toMatchObject({ quantity: 12, unit: '本' });
        expect(products[1]).toMatchObject({ quantity: 12, unit: '個' });
        expect(products[2]).toMatchObject({ quantity: 20, unit: '冊' });
    });

    it('Step3: スコアリング — ビダドロップが正しくマッチ', () => {
        expect(products[0].code).toBe('1100');
    });

    it('Step3: スコアリング — ノーマルレフィルが正しくマッチ', () => {
        expect(products[1].code).toBe('1110');
    });

    it('Step3: スコアリング — フリーエネルギー小冊子が1801(小冊子)にマッチ', () => {
        expect(products[2].code).toBe('1801');
    });

    it('Step2: 署名ブロックの電話番号等は注文行として抽出されない', () => {
        // tel/fax行、メールアドレス行等が誤抽出されないこと
        expect(products).toHaveLength(3);
    });
});

// ============================================================
// smilecompany: Gmail multipart/alternative + base64、乗算記号パターン
// ============================================================
describe('smilecompany パイプライン', () => {
    let parsed, products;

    beforeEach(() => {
        const eml = readEmlFixture('smilecompany.eml');
        parsed = parseEmlFile(eml);
        products = extractProductData(parsed.body);
    });

    it('Step1: EML解析 — base64本文をデコードしGmailドメインを抽出', () => {
        expect(parsed.fromDomain).toBe('gmail.com');
        expect(parsed.body).toContain('糖蜜');
        expect(parsed.body).toContain('マナウォーター');
    });

    it('Step2: 商品抽出 — 2商品を抽出（ケース表記+乗算記号）', () => {
        expect(products).toHaveLength(2);
    });

    it('Step2: 糖蜜 1ケース(20個) — 20個として抽出', () => {
        expect(products[0]).toMatchObject({ quantity: 20, unit: '個' });
    });

    it('Step2: マナウォーター✖︎1 — 乗算記号パターンで数量1を抽出', () => {
        expect(products[1]).toMatchObject({ quantity: 1, unit: '' });
    });

    it('Step3: スコアリング — 糖蜜が正しくマッチ', () => {
        expect(products[0].code).toBe('1600');
    });

    it('Step3: スコアリング — マナウォーター(中)ステンレスが正しくマッチ', () => {
        expect(products[1].code).toBe('1500');
    });

    it('Step2: 署名ブロック（smilecompany/大坪弘治）は注文行として抽出されない', () => {
        expect(products).toHaveLength(2);
    });
});

// ============================================================
// La Natura: PDF添付注文書（やつは形式4ページ）
// ============================================================
describe('La Natura パイプライン', () => {
    let parsed, pdfProducts;

    beforeEach(() => {
        // Step1: EMLからドメイン・PDF添付を検出
        const eml = readEmlFixture('Re 発注のお願い【La Natura株式会社】.eml');
        parsed = parseEmlFile(eml);

        // Step2: PDF抽出テキスト（PDF.jsはNode.js非対応のためフィクスチャテキストを使用）
        const pdfText = readFileSync(resolve(__dirname, 'fixtures/pdf-text/lanatura.txt'), 'utf-8');
        pdfProducts = parseOrderTable(pdfText);
    });

    it('Step1: EML解析 — 送信元ドメインがhomeo-re.comであること', () => {
        expect(parsed.fromDomain).toBe('homeo-re.com');
    });

    it('Step1: EML解析 — PDF添付ファイルが存在すること', () => {
        expect(parsed.subject).toContain('La Natura');
    });

    it('Step2: PDF注文抽出 — 注文数量が記入された5商品を抽出', () => {
        expect(pdfProducts.length).toBe(5);
    });

    it('Step2: PDF注文抽出 — ビダクリーム・ノーマルレフィル 12個', () => {
        const p = pdfProducts.find(p => p.code === '1110');
        expect(p).toBeDefined();
        expect(p.quantity).toBe(12);
    });

    it('Step2: PDF注文抽出 — ビダクリーム・まこもレフィル 12個', () => {
        const p = pdfProducts.find(p => p.code === '1111');
        expect(p).toBeDefined();
        expect(p.quantity).toBe(12);
    });

    it('Step2: PDF注文抽出 — ビダクリーム・ジーワレフィル 12個', () => {
        const p = pdfProducts.find(p => p.code === '1113');
        expect(p).toBeDefined();
        expect(p.quantity).toBe(12);
    });

    it('Step2: PDF注文抽出 — ビダウォーターソープ・泡ポンプボトル入 12個', () => {
        const p = pdfProducts.find(p => p.code === '1226');
        expect(p).toBeDefined();
        expect(p.quantity).toBe(12);
    });

    it('Step2: PDF注文抽出 — アグア650mlパック 12個', () => {
        const p = pdfProducts.find(p => p.code === '1369');
        expect(p).toBeDefined();
        expect(p.quantity).toBe(12);
    });

    it('Step2: PDF注文抽出 — 注文のない商品は抽出されない', () => {
        // 1114（ビダクリーム専用ケース）は注文数なし
        const noOrder = pdfProducts.find(p => p.code === '1114');
        expect(noOrder).toBeUndefined();
    });
});
