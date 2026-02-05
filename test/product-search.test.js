/**
 * 商品名キーワード検索テスト
 * searchProductsByText のバイグラム類似度スコアリング検証
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchProductsByText, clearProductMaster } from '../js/common/product-master.js';

// テスト用商品マスタデータ
const MOCK_PRODUCTS = {
    '1221': { code: '1221', name: 'ビダウォーターソープ・詰替用(400ml)', category1: '', price1: 1320, price2: 0, price3: 0, lotSize: 0 },
    '1224': { code: '1224', name: '泡ﾎﾟﾝﾌﾟ400ml空容器', category1: '', price1: 509, price2: 0, price3: 0, lotSize: 0 },
    '1379': { code: '1379', name: 'お米と大豆の酵素水650ml+200ml遮光ｽﾌﾟﾚｰｾｯﾄ', category1: '', price1: 2200, price2: 0, price3: 0, lotSize: 0 },
    '1393': { code: '1393', name: 'お米と大豆の酵素水650mlパック', category1: '', price1: 1380, price2: 0, price3: 0, lotSize: 0 },
    '1110': { code: '1110', name: 'ノーマルレフィル', category1: '', price1: 1584, price2: 0, price3: 0, lotSize: 0 }
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
    localStorage.setItem('productMaster', JSON.stringify({
        products: MOCK_PRODUCTS,
        count: Object.keys(MOCK_PRODUCTS).length
    }));
});

describe('searchProductsByText バイグラム類似度', () => {
    it('「ビダソープ詰め替え用 400ml」→ 1221(ソープ詰替用)が1224(泡ポンプ)より上位', () => {
        const results = searchProductsByText('ビダソープ詰め替え用 400ml');
        expect(results.length).toBeGreaterThanOrEqual(2);

        const top = results[0];
        expect(top.code).toBe('1221');
        // 1224は1221より下位
        const idx1221 = results.findIndex(r => r.code === '1221');
        const idx1224 = results.findIndex(r => r.code === '1224');
        expect(idx1221).toBeLessThan(idx1224);
    });

    it('「大豆とお米の酵素 650ml」→ 1393(単品)が1379(セット)より上位', () => {
        const results = searchProductsByText('大豆とお米の酵素 650ml');
        expect(results.length).toBeGreaterThanOrEqual(2);

        const top = results[0];
        expect(top.code).toBe('1393');
        // 1379はセット商品なので下位
        const idx1393 = results.findIndex(r => r.code === '1393');
        const idx1379 = results.findIndex(r => r.code === '1379');
        expect(idx1393).toBeLessThan(idx1379);
    });

    it('バイグラムスコアが結果に含まれる', () => {
        const results = searchProductsByText('ビダソープ詰め替え用 400ml');
        expect(results[0]).toHaveProperty('bigramScore');
        expect(results[0].bigramScore).toBeGreaterThan(0);
    });

    it('マッチしない検索は空配列を返す', () => {
        const results = searchProductsByText('存在しない商品ABC');
        expect(results).toHaveLength(0);
    });
});
