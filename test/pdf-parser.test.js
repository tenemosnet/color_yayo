/**
 * pdf-parser.js 単体テスト
 * テキストPDF（やつは等）の注文テーブル解析
 */
import { describe, it, expect } from 'vitest';
import { parseOrderTable } from '../js/wholesale/parsers/pdf-parser.js';

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
