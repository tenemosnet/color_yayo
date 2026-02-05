/**
 * text-parser.js 単体テスト
 * 山善メール本文からの商品データ抽出
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { extractProductData, calculateAmount, calculateTotal, zenToHan } from '../js/wholesale/parsers/text-parser.js';

// searchProductsByText が localStorage を使うためモック
beforeAll(() => {
    vi.stubGlobal('localStorage', {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
    });
});

describe('zenToHan', () => {
    it('全角数字を半角に変換する', () => {
        expect(zenToHan('２４')).toBe('24');
        expect(zenToHan('１２３')).toBe('123');
    });

    it('半角数字はそのまま', () => {
        expect(zenToHan('24')).toBe('24');
    });

    it('混在した文字列を変換する', () => {
        expect(zenToHan('商品１２個')).toBe('商品12個');
    });
});

describe('extractProductData', () => {
    it('標準的な山善メール形式から商品を抽出する', () => {
        const emailBody = `
ご注文内容:
1110 ノーマルレフィル　２４個
1374 ペットアグア1リットル　１２本
        `;
        const products = extractProductData(emailBody);
        expect(products).toHaveLength(2);
        expect(products[0]).toMatchObject({ code: '1110', name: 'ノーマルレフィル', quantity: 24, unit: '個' });
        expect(products[1]).toMatchObject({ code: '1374', name: 'ペットアグア1リットル', quantity: 12, unit: '本' });
    });

    it('半角数字の数量も抽出する', () => {
        const emailBody = '1110 ノーマルレフィル 24個';
        const products = extractProductData(emailBody);
        expect(products).toHaveLength(1);
        expect(products[0].quantity).toBe(24);
    });

    it('単位なしの行も抽出する', () => {
        const emailBody = '1221 ビダウォーターソープ　12';
        const products = extractProductData(emailBody);
        expect(products).toHaveLength(1);
        expect(products[0].unit).toBe('');
    });

    it('商品がないメールは空配列を返す', () => {
        const emailBody = 'お世話になっております。\n確認お願いします。';
        const products = extractProductData(emailBody);
        expect(products).toHaveLength(0);
    });

    it('アベナチュラル形式: 商品名＋容量＋ロット数を抽出する', () => {
        const emailBody = `テネモスネット
菅原様

いつもお世話になっております。

大豆とお米の酵素 650ml １ロット
ビダソープ詰め替え用 400ml １ロット

注文お願いいたします。
何卒よろしくお願いします。`;
        const products = extractProductData(emailBody);
        expect(products).toHaveLength(2);
        expect(products[0].quantity).toBe(1);
        expect(products[0].unit).toBe('ロット');
        expect(products[1].quantity).toBe(1);
        expect(products[1].unit).toBe('ロット');
    });

    it('ロット単位: 全角数字の複数ロットを正しく抽出する', () => {
        const emailBody = '大豆とお米の酵素 650ml ２ロット';
        const products = extractProductData(emailBody);
        expect(products).toHaveLength(1);
        expect(products[0].quantity).toBe(2);
        expect(products[0].unit).toBe('ロット');
    });

    it('単価と金額は初期値0で返す', () => {
        const emailBody = '1110 テスト商品　12個';
        const products = extractProductData(emailBody);
        expect(products[0].unitPrice).toBe(0);
        expect(products[0].amount).toBe(0);
    });
});

describe('calculateAmount', () => {
    it('単価×数量を計算する', () => {
        expect(calculateAmount({ unitPrice: 1000, quantity: 3 })).toBe(3000);
    });

    it('単価がない場合は0', () => {
        expect(calculateAmount({ unitPrice: 0, quantity: 5 })).toBe(0);
    });
});

describe('calculateTotal', () => {
    it('全商品の合計金額を計算する', () => {
        const products = [
            { amount: 1000 },
            { amount: 2000 },
            { amount: 500 }
        ];
        expect(calculateTotal(products)).toBe(3500);
    });

    it('空配列は0を返す', () => {
        expect(calculateTotal([])).toBe(0);
    });
});
