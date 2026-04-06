/**
 * pdf-parser.js 単体テスト
 * テキストPDF（やつは・村上印等）の注文テーブル解析
 */
import { describe, it, expect } from 'vitest';
import { parseOrderTable, parseMurakamiOrderPdf } from '../js/wholesale/parsers/pdf-parser.js';

describe('parseOrderTable', () => {
    it('標準的な注文テーブルから商品を抽出する', () => {
        // 小売価格 卸価格 卸単位 数量
        const text = '1110 ビダクリームノーマルレフィル 2,640 1,584 12 48 1221 ビダウォーターソープ 3,300 1,980 12 24';
        const products = parseOrderTable(text);
        expect(products).toHaveLength(2);
        expect(products[0]).toMatchObject({ code: '1110', quantity: 48 });
        expect(products[1]).toMatchObject({ code: '1221', quantity: 24 });
    });

    it('低価格商品（フォールバックパターン）を抽出する', () => {
        // 小売価格 < 300 だが >= 100
        const text = '1396 遮光スプレー200ml空容器 800 560 6 6';
        const products = parseOrderTable(text);
        expect(products).toHaveLength(1);
        expect(products[0]).toMatchObject({ code: '1396', quantity: 6 });
    });

    it('日付コード（2025-2030）を除外する', () => {
        const text = '2026年1月28日 注文書 1110 テスト商品 2,640 1,584 12 24';
        const products = parseOrderTable(text);
        expect(products).toHaveLength(1);
        expect(products[0].code).toBe('1110');
    });

    it('商品コードがないテキストは空配列を返す', () => {
        const text = 'お世話になっております。確認お願いします。';
        const products = parseOrderTable(text);
        expect(products).toHaveLength(0);
    });

    it('数字が不足しているコードはスキップする', () => {
        // 数字が3つ未満のセグメントはスキップ
        const text = '1110 テスト商品 100';
        const products = parseOrderTable(text);
        expect(products).toHaveLength(0);
    });

    it('同じコードの重複を排除する', () => {
        const text = '1110 商品A 2,640 1,584 12 48 1110 商品A再掲 2,640 1,584 12 24';
        const products = parseOrderTable(text);
        expect(products).toHaveLength(1);
    });

    it('消費税パターンを除外する', () => {
        const text = '1110 商品A 消費税8% 2,640 1,584 12 24';
        const products = parseOrderTable(text);
        expect(products).toHaveLength(1);
        expect(products[0].quantity).toBe(24);
    });
});

describe('parseMurakamiOrderPdf', () => {
    it('村上印フォーマット（数量×単価=金額）から商品を抽出する', () => {
        const text = '発注書 ㈱テネモスネット 様 発注日 2026-04-03 株式会社村上印オーガニック ' +
            '摘要 数量 単価 明細金額 ' +
            '1369 アグア650ml 24 P 1,720 41,280 ' +
            '1396 遮光スプレー200ml 24 本 624 14,976 ' +
            '1226 ビダソープ 5L 4 個 12,848 51,392';
        const result = parseMurakamiOrderPdf(text);

        expect(result.companyName).toBe('村上印オーガニック');
        expect(result.date).toBe('20260403');
        expect(result.products).toHaveLength(3);
        expect(result.products[0]).toMatchObject({ code: '1369', quantity: 24 });
        expect(result.products[1]).toMatchObject({ code: '1396', quantity: 24 });
        expect(result.products[2]).toMatchObject({ code: '1226', quantity: 4 });
    });

    it('日付コード（2026等）を商品コードとして誤検出しない', () => {
        const text = '発注日 2026-04-03 1369 アグア650ml 24 P 1,720 41,280';
        const result = parseMurakamiOrderPdf(text);
        expect(result.products).toHaveLength(1);
        expect(result.products[0].code).toBe('1369');
    });

    it('商品がないテキストは空配列を返す', () => {
        const text = '発注書 株式会社村上印オーガニック 2026-04-03';
        const result = parseMurakamiOrderPdf(text);
        expect(result.products).toHaveLength(0);
        expect(result.date).toBe('20260403');
    });
});
