/**
 * エンコーディングテスト
 * Shift-JIS変換の正当性を検証
 */
import { describe, it, expect } from 'vitest';
import Encoding from 'encoding-japanese';

describe('Shift-JIS変換', () => {
    /**
     * converter.jsのdownloadAsShiftJIS()と同じ変換ロジック
     */
    function convertToShiftJIS(content) {
        const sjisArray = Encoding.convert(Encoding.stringToCode(content), {
            to: 'SJIS',
            from: 'UNICODE'
        });
        return new Uint8Array(sjisArray);
    }

    function decodeShiftJIS(uint8Array) {
        const detected = Encoding.detect(uint8Array);
        const unicodeArray = Encoding.convert(Array.from(uint8Array), {
            to: 'UNICODE',
            from: detected
        });
        return Encoding.codeToString(unicodeArray);
    }

    it('ASCII文字列をShift-JISに変換・復元できる', () => {
        const original = 'Hello World 12345';
        const sjis = convertToShiftJIS(original);
        const restored = decodeShiftJIS(sjis);
        expect(restored).toBe(original);
    });

    it('日本語（ひらがな）をShift-JISに変換・復元できる', () => {
        const original = 'テネモスショップ';
        const sjis = convertToShiftJIS(original);
        const restored = decodeShiftJIS(sjis);
        expect(restored).toBe(original);
    });

    it('弥生TSV行をShift-JISに変換・復元できる', () => {
        const tsvLine = '1\t1\t0\t20260128\t0001\t24\t2\t5\t1\t1\t000034\t020\t11\t1\t1\t1110\t\tノーマルレフィル\t13';
        const sjis = convertToShiftJIS(tsvLine);
        const restored = decodeShiftJIS(sjis);
        expect(restored).toBe(tsvLine);
    });

    it('タブ区切りが保持される', () => {
        const content = 'フィールド1\tフィールド2\tフィールド3';
        const sjis = convertToShiftJIS(content);
        const restored = decodeShiftJIS(sjis);
        expect(restored.split('\t')).toHaveLength(3);
    });

    it('CRLF改行が保持される', () => {
        const content = '行1\r\n行2\r\n行3';
        const sjis = convertToShiftJIS(content);
        const restored = decodeShiftJIS(sjis);
        expect(restored).toContain('\r\n');
        expect(restored.split('\r\n')).toHaveLength(3);
    });

    it('特殊文字（括弧、記号）をShift-JISに変換・復元できる', () => {
        const original = 'ビダクリーム（30ml）・送料込み￥1,000';
        const sjis = convertToShiftJIS(original);
        const restored = decodeShiftJIS(sjis);
        expect(restored).toBe(original);
    });

    it('全角数字をShift-JISに変換・復元できる', () => {
        const original = '売上単価１・２・３';
        const sjis = convertToShiftJIS(original);
        const restored = decodeShiftJIS(sjis);
        expect(restored).toBe(original);
    });
});
