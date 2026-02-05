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
    '1393': { code: '1393', name: 'お米と大豆の酵素水650mlパック', category1: '', price1: 1380, price2: 0, price3: 0, lotSize: 0 }
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
