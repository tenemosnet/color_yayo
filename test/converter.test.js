/**
 * converter.js 結合テスト
 * 弥生販売59フィールドTSV生成
 */
import { describe, it, expect } from 'vitest';
import { convertToYayoiFormat, getDateString, determineNounyuCode } from '../js/wholesale/converter.js';

describe('convertToYayoiFormat', () => {
    const sampleProducts = [
        { code: '1110', name: 'ノーマルレフィル', quantity: 24, unitPrice: 1742, amount: 41808 },
        { code: '0011', name: '送料（東北）', quantity: 1, unitPrice: 880, amount: 880 }
    ];

    const sampleSettings = {
        denpyoNo: '0001',
        orderDate: '2026-01-28',
        tantoshaCode: '11',
        tokuisakiCode: '000034',
        customerName: '山善株式会社',
        torihikiKubun: 2,
        nounyuCode: '020'
    };

    it('タブ区切りで59フィールドの行を生成する', () => {
        const result = convertToYayoiFormat(sampleProducts, sampleSettings);
        const lines = result.split('\r\n');
        expect(lines).toHaveLength(2);

        const fields = lines[0].split('\t');
        expect(fields).toHaveLength(59);
    });

    it('伝票日付がYYYYMMDD形式で設定される', () => {
        const result = convertToYayoiFormat(sampleProducts, sampleSettings);
        const fields = result.split('\r\n')[0].split('\t');
        expect(fields[3]).toBe('20260128'); // フィールド4: 伝票日付
    });

    it('得意先コードが正しく設定される', () => {
        const result = convertToYayoiFormat(sampleProducts, sampleSettings);
        const fields = result.split('\r\n')[0].split('\t');
        expect(fields[10]).toBe('000034'); // フィールド11: 得意先コード
    });

    it('納入コードが正しく設定される', () => {
        const result = convertToYayoiFormat(sampleProducts, sampleSettings);
        const fields = result.split('\r\n')[0].split('\t');
        expect(fields[11]).toBe('020'); // フィールド12: 納入コード
    });

    it('商品コード・数量・単価・金額が正しく設定される', () => {
        const result = convertToYayoiFormat(sampleProducts, sampleSettings);
        const fields = result.split('\r\n')[0].split('\t');
        expect(fields[15]).toBe('1110');  // フィールド16: 商品コード
        expect(fields[23]).toBe('24');    // フィールド24: 数量
        expect(fields[24]).toBe('1742');  // フィールド25: 単価
        expect(fields[25]).toBe('41808'); // フィールド26: 金額
    });

    it('行コードが連番になる', () => {
        const result = convertToYayoiFormat(sampleProducts, sampleSettings);
        const lines = result.split('\r\n');
        expect(lines[0].split('\t')[13]).toBe('1'); // 行コード1
        expect(lines[1].split('\t')[13]).toBe('2'); // 行コード2
    });

    it('取引区分が設定される', () => {
        const result = convertToYayoiFormat(sampleProducts, sampleSettings);
        const fields = result.split('\r\n')[0].split('\t');
        expect(fields[6]).toBe('2'); // フィールド7: 取引区分
    });
});

describe('determineNounyuCode', () => {
    it('取引区分に基づいて納入コードを返す', () => {
        expect(determineNounyuCode({ code: '000034', torihikiKubun: 1 })).toBe('020');
        expect(determineNounyuCode({ code: '001568', torihikiKubun: 1 })).toBe('030');
        expect(determineNounyuCode({ code: '000913', torihikiKubun: 3 })).toBe('002');
        expect(determineNounyuCode({ code: '999999', torihikiKubun: 2 })).toBe('003');
    });

    it('nullの場合は空白を返す', () => {
        expect(determineNounyuCode(null)).toBe('');
    });
});

describe('getDateString', () => {
    it('YYYYMMDD形式の文字列を返す', () => {
        const result = getDateString();
        expect(result).toMatch(/^\d{8}$/);
    });
});
