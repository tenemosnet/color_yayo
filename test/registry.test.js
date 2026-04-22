/**
 * registry.js 単体テスト
 * 取引先レジストリの設定・検索
 */
import { describe, it, expect } from 'vitest';
import { VENDORS, getNounyuCodeByCustomer, getDomainToNameMapping, getFaxCustomerCodes } from '../js/wholesale/registry.js';

describe('VENDORS', () => {
    it('9社の取引先が定義されている', () => {
        expect(Object.keys(VENDORS)).toHaveLength(9);
        expect(VENDORS.YAMAZEN).toBeDefined();
        expect(VENDORS.YATSUHA).toBeDefined();
        expect(VENDORS.OPTIMAL).toBeDefined();
        expect(VENDORS.HIRYU).toBeDefined();
        expect(VENDORS.MOTHERS_I).toBeDefined();
        expect(VENDORS.ABE_NATURAL).toBeDefined();
        expect(VENDORS.PONOMAIL).toBeDefined();
        expect(VENDORS.MURAKAMI_IN).toBeDefined();
        expect(VENDORS.LA_NATURA).toBeDefined();
    });

    it('各取引先にcodeがある（nounyuCodeは任意）', () => {
        for (const vendor of Object.values(VENDORS)) {
            expect(vendor.code).toMatch(/^\d{6}$/);
            // nounyuCodeがある場合は3桁数字であること
            if (vendor.nounyuCode !== undefined) {
                expect(vendor.nounyuCode).toMatch(/^\d{3}$/);
            }
        }
    });
});

describe('getNounyuCodeByCustomer', () => {
    it('掛売（取引区分1）: 山善 → 020', () => {
        expect(getNounyuCodeByCustomer('000034', 1)).toBe('020');
    });

    it('掛売（取引区分1）: 山善以外 → 030', () => {
        expect(getNounyuCodeByCustomer('001568', 1)).toBe('030');
        expect(getNounyuCodeByCustomer('001564', 1)).toBe('030');
        expect(getNounyuCodeByCustomer('007025', 1)).toBe('030');
        expect(getNounyuCodeByCustomer('999999', 1)).toBe('030');
    });

    it('現金（取引区分2）→ 003', () => {
        expect(getNounyuCodeByCustomer('999999', 2)).toBe('003');
        expect(getNounyuCodeByCustomer('000034', 2)).toBe('003');
    });

    it('都度請求（取引区分4）→ 002', () => {
        expect(getNounyuCodeByCustomer('000913', 4)).toBe('002');
        expect(getNounyuCodeByCustomer('999999', 4)).toBe('002');
    });

    it('サンプル（取引区分3）→ 空白', () => {
        expect(getNounyuCodeByCustomer('000913', 3)).toBe('');
    });

    it('取引区分なし → 空白', () => {
        expect(getNounyuCodeByCustomer('999999')).toBe('');
    });
});

describe('getDomainToNameMapping', () => {
    it('ドメインマッピングを返す', () => {
        const mapping = getDomainToNameMapping();
        expect(mapping.yamazen).toBe('山善');
        expect(mapping.yatsuha).toBe('やつは');
        expect(mapping.abenatural).toBe('アベナチュラル');
        expect(mapping['homeo-re']).toBe('La Natura株式会社');
    });
});

describe('getFaxCustomerCodes', () => {
    it('FAX取引先のコードを返す', () => {
        const codes = getFaxCustomerCodes();
        expect(codes.OPTIMAL).toBe('000913');
        expect(codes.HIRYU).toBe('001564');
    });

    it('EML/PDF-text取引先は含まない', () => {
        const codes = getFaxCustomerCodes();
        expect(codes.YAMAZEN).toBeUndefined();
        expect(codes.YATSUHA).toBeUndefined();
    });
});
