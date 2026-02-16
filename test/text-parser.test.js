/**
 * text-parser.js 単体テスト
 * 山善メール本文からの商品データ抽出
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { extractProductData, calculateAmount, calculateTotal, zenToHan, stripQuotedReplies } from '../js/wholesale/parsers/text-parser.js';

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

    it('コード付き数量なし行: 数量1でフォールバック抽出する', () => {
        // "20キロ" は商品仕様（重量）であり注文数量ではない
        const emailBody = '1711  ボリビア岩塩 20キロ';
        const products = extractProductData(emailBody);
        expect(products).toHaveLength(1);
        expect(products[0]).toMatchObject({ code: '1711', quantity: 1, unit: '' });
    });

    it('コード付き数量なし行: 商品名のみの行も数量1で抽出する', () => {
        const emailBody = '1340 ポケットピッコロ';
        const products = extractProductData(emailBody);
        expect(products).toHaveLength(1);
        expect(products[0]).toMatchObject({ code: '1340', name: 'ポケットピッコロ', quantity: 1, unit: '' });
    });

    it('冊単位: コードなし行から数量と単位を抽出する', () => {
        const emailBody = 'フリーエネルギー本 20冊';
        const products = extractProductData(emailBody);
        expect(products).toHaveLength(1);
        expect(products[0]).toMatchObject({ quantity: 20, unit: '冊' });
    });

    it('引用返信（日本語Gmail形式）を除外して商品を抽出する', () => {
        const emailBody = `注文お願いします。

1711  ボリビア岩塩 20キロ

2025年2月25日(火) 10:42 テネモスネット卸販売部 <order@tenemos.jp>:

> PONO's kitchen 頭師理恵 様
> 1510  マナウォーター青 1個`;
        const products = extractProductData(emailBody);
        expect(products).toHaveLength(1);
        expect(products[0].code).toBe('1711');
    });

    it('引用返信（英語Gmail形式）を除外する', () => {
        const emailBody = `1110 テスト商品　12個

On 2025/02/24 23:25, Test User wrote:
> 1221 古い注文 6個`;
        const products = extractProductData(emailBody);
        expect(products).toHaveLength(1);
        expect(products[0].code).toBe('1110');
    });

    it('>プレフィックスの引用行をスキップする', () => {
        const emailBody = `1110 テスト商品　12個
> 1221 古い引用 6個`;
        const products = extractProductData(emailBody);
        expect(products).toHaveLength(1);
        expect(products[0].code).toBe('1110');
    });
});

describe('stripQuotedReplies', () => {
    it('日本語Gmail quoteヘッダー以降を切り捨て', () => {
        const lines = [
            '注文お願いします。',
            '',
            '2025年2月25日(火) 10:42 テネモスネット:',
            '',
            '> 古い注文'
        ];
        const result = stripQuotedReplies(lines);
        expect(result).toHaveLength(2);
        expect(result[0]).toBe('注文お願いします。');
    });

    it('英語Gmail quoteヘッダー以降を切り捨て', () => {
        const lines = [
            '新しい注文',
            'On 2025/02/24 23:25, りえ wrote:',
            '> 古い注文'
        ];
        const result = stripQuotedReplies(lines);
        expect(result).toHaveLength(1);
        expect(result[0]).toBe('新しい注文');
    });

    it('>プレフィックス行をフィルタリング', () => {
        const lines = [
            '新しい注文',
            '> 引用行',
            'もう1行'
        ];
        const result = stripQuotedReplies(lines);
        expect(result).toEqual(['新しい注文', 'もう1行']);
    });

    it('引用なしのメールはそのまま返す', () => {
        const lines = ['行1', '行2', '行3'];
        const result = stripQuotedReplies(lines);
        expect(result).toEqual(['行1', '行2', '行3']);
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
