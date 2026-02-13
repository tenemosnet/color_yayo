import { describe, it, expect } from 'vitest';
import { parseYuchoBankCSV } from '../js/retail/bank-parser.js';
import { readFileSync } from 'fs';
import { join } from 'path';

// テスト用: fixtureのShift-JIS CSVをUTF-8で読み込む
function loadFixtureCSV() {
    const buf = readFileSync(join(__dirname, 'fixtures/yucho-sample.csv'));
    const decoder = new TextDecoder('shift-jis');
    return decoder.decode(buf);
}

describe('parseYuchoBankCSV', () => {
    it('ゆうちょCSVから入金レコードのみ抽出する', () => {
        const csvText = loadFixtureCSV();
        const deposits = parseYuchoBankCSV(csvText);

        // 入金（受入金額あり）のみ抽出されること
        expect(deposits.length).toBeGreaterThan(0);
        deposits.forEach(d => {
            expect(d.amount).toBeGreaterThan(0);
            expect(d.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        });
    });

    it('払出・振込人名なしのレコードは除外する', () => {
        const csvText = loadFixtureCSV();
        const deposits = parseYuchoBankCSV(csvText);

        // 振込人名が空のレコードは除外されること
        deposits.forEach(d => {
            expect(d.name).not.toBe('');
        });

        // 払出のみのレコード（料金、電気等）は含まれないこと
        deposits.forEach(d => {
            expect(d.amount).toBeGreaterThan(0);
        });
    });

    it('日付をYYYY-MM-DD形式に変換する', () => {
        const csvText = loadFixtureCSV();
        const deposits = parseYuchoBankCSV(csvText);

        const first = deposits[0];
        expect(first.date).toBe('2026-01-06');
    });

    it('振込人名を正しく取得する（漢字・半角カナ両方）', () => {
        const csvText = loadFixtureCSV();
        const deposits = parseYuchoBankCSV(csvText);

        // 漢字名（送金）の存在確認
        const kanjiNames = deposits.filter(d => /[一-龥]/.test(d.name));
        expect(kanjiNames.length).toBeGreaterThan(0);

        // 半角カナ名（振込）の存在確認
        const kanaNames = deposits.filter(d => /[ｦ-ﾟ]/.test(d.name));
        expect(kanaNames.length).toBeGreaterThan(0);
    });

    it('金額を正しく数値に変換する', () => {
        const csvText = loadFixtureCSV();
        const deposits = parseYuchoBankCSV(csvText);

        // 最初の入金（振込人名あり）: 12320円（平井　孝彦）
        const first = deposits[0];
        expect(first.amount).toBe(12320);
    });

    it('ヘッダー行のみのCSVは空配列を返す', () => {
        const csvText = `お客さま口座情報,,,,,,
現在高：,0,円,,,,
出力日時：令和 08 年 02 月 06 日,,,,,,
お客さま口座番号：10340-08521821,,,,,,
照会対象：全期間,,,,,,
明細件数：0,,,,,,
取引日,入出金明細ＩＤ,受入金額（円）,払出金額（円）,詳細１,詳細２,現在（貸付）高`;
        const deposits = parseYuchoBankCSV(csvText);
        expect(deposits).toEqual([]);
    });

    it('入金レコードの詳細１（種別）を取得する', () => {
        const csvText = loadFixtureCSV();
        const deposits = parseYuchoBankCSV(csvText);

        const types = new Set(deposits.map(d => d.type));
        // 振込と送金が含まれること
        expect(types.has('振込')).toBe(true);
        expect(types.has('送金')).toBe(true);
    });
});
