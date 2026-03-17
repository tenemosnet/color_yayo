import { describe, it, expect } from 'vitest';
import { parseFormrunEntry, isFormrunEntry, generateCustomerTXT } from '../js/wholesale/parsers/formrun-parser.js';

// サンプルメール本文（formrunエントリーフォーム）
const sampleBody = `テネモス製品　卸販売店エントリーフォームにて、フォーム投稿／回答があり、カードが生成されました。
管理画面にアクセスして、内容を確認しましょう。

※以下のクリックボタンより詳細を確認できるのは、該当フォームの権限を有している方のみとなります。カードを確認できない場合は、フォームの保有者にお伝えください。

法名・会社名
nobii nobee coffee 個人事業主のため屋号

（フリガナ）
ノビーノビーコーヒー

代表者名/姓
下野

代表者名/名
允絹

名前（フリガナ）/セイ
シモノ

名前（フリガナ）/メイ
ノブマサ

購買担当者名/姓
下野

購買担当者名/名
允絹

名前（フリガナ）/セイ
シモノ

名前（フリガナ）/メイ
ノブマサ

設立
2024/09/09

住所 (郵便番号)
2940047

住所 (都道府県)
千葉県

住所 (市区町村)
館山市 八幡

住所 (番地)
360-8

住所 (建物名)
回答なし

ホームページURL
回答なし

メールアドレス
nobii.nobee.coffee@gmail.com

会社代表番号
08020741204

担当者　電話番号
回答なし

担当者　メールアドレス
回答なし

取扱予定商品
醗酵クリーム・ソープ、万能醗酵酵素水、食品、ペット, 空気活性機：ピッコロ、キューブ／エネルギーチャージ機：バンブー,
水処理器：マナウォーター

業務内容と販売予定の方法（ホームページ、実店舗など）
事業は、手焙煎コーヒー教室・焙煎所を実店舗で構えています。

業務内容が分かる資料
回答なし

ログインして確認する
( https://form.run/teams/342038/workflows/624712/board/all/card/122064173 )

Powered by formrun`;

describe('formrun-parser', () => {
    describe('parseFormrunEntry', () => {
        it('会社名を正しく抽出する', () => {
            const result = parseFormrunEntry(sampleBody);
            expect(result.companyName).toBe('nobii nobee coffee 個人事業主のため屋号');
        });

        it('フリガナを正しく抽出する', () => {
            const result = parseFormrunEntry(sampleBody);
            expect(result.furigana).toBe('ノビーノビーコーヒー');
        });

        it('代表者名を正しく結合する', () => {
            const result = parseFormrunEntry(sampleBody);
            expect(result.representative).toBe('下野 允絹');
            expect(result.repLastName).toBe('下野');
            expect(result.repFirstName).toBe('允絹');
        });

        it('購買担当者が代表者と同じ場合は空にする', () => {
            const result = parseFormrunEntry(sampleBody);
            expect(result.buyer).toBe('');
        });

        it('住所を正しく抽出する', () => {
            const result = parseFormrunEntry(sampleBody);
            expect(result.zip).toBe('2940047');
            expect(result.prefecture).toBe('千葉県');
            expect(result.city).toBe('館山市 八幡');
            expect(result.address).toBe('360-8');
        });

        it('「回答なし」を空文字に変換する', () => {
            const result = parseFormrunEntry(sampleBody);
            expect(result.building).toBe('');
            expect(result.buyerPhone).toBe('');
            expect(result.buyerEmail).toBe('');
        });

        it('メールアドレスを正しく抽出する', () => {
            const result = parseFormrunEntry(sampleBody);
            expect(result.email).toBe('nobii.nobee.coffee@gmail.com');
        });

        it('電話番号を正しく抽出する', () => {
            const result = parseFormrunEntry(sampleBody);
            expect(result.phone).toBe('08020741204');
        });

        it('取扱予定商品を抽出する', () => {
            const result = parseFormrunEntry(sampleBody);
            expect(result.products).toContain('醗酵クリーム');
            expect(result.products).toContain('マナウォーター');
        });
    });

    describe('isFormrunEntry', () => {
        it('件名にエントリーフォームを含む場合trueを返す', () => {
            expect(isFormrunEntry('', 'テネモス製品 卸販売店エントリーフォームにフォーム投稿')).toBe(true);
        });

        it('本文に特徴的なフィールドを含む場合trueを返す', () => {
            expect(isFormrunEntry(sampleBody, '')).toBe(true);
        });

        it('関係ないメールではfalseを返す', () => {
            expect(isFormrunEntry('注文内容', '注文確認')).toBe(false);
        });
    });

    describe('generateCustomerTXT', () => {
        it('48フィールドのタブ区切りを生成する', () => {
            const customer = parseFormrunEntry(sampleBody);
            const txt = generateCustomerTXT(customer, '000150');
            const fields = txt.split('\t');
            expect(fields.length).toBe(48);
        });

        it('得意先コードが正しく設定される', () => {
            const customer = parseFormrunEntry(sampleBody);
            const txt = generateCustomerTXT(customer, '000150');
            const fields = txt.split('\t');
            expect(fields[0]).toBe('000150');
        });

        it('名称と略称が会社名と一致する', () => {
            const customer = parseFormrunEntry(sampleBody);
            const txt = generateCustomerTXT(customer, '000150');
            const fields = txt.split('\t');
            expect(fields[1]).toBe('nobii nobee coffee 個人事業主のため屋号');
            expect(fields[3]).toBe('nobii nobee coffee 個人事業主のため屋号');
        });

        it('フリガナが半角カタカナに変換される', () => {
            const customer = parseFormrunEntry(sampleBody);
            const txt = generateCustomerTXT(customer, '000150');
            const fields = txt.split('\t');
            expect(fields[2]).toBe('ﾉﾋﾞｰﾉﾋﾞｰｺｰﾋｰ');
        });

        it('住所が正しく結合される', () => {
            const customer = parseFormrunEntry(sampleBody);
            const txt = generateCustomerTXT(customer, '000150');
            const fields = txt.split('\t');
            expect(fields[4]).toBe('2940047');
            expect(fields[5]).toBe('千葉県館山市 八幡360-8');
            expect(fields[6]).toBe(''); // 建物名「回答なし」→空
        });

        it('担当者に代表者名が設定される', () => {
            const customer = parseFormrunEntry(sampleBody);
            const txt = generateCustomerTXT(customer, '000150');
            const fields = txt.split('\t');
            expect(fields[9]).toBe('下野 允絹');
        });

        it('取引区分=2、単価種類=2が設定される', () => {
            const customer = parseFormrunEntry(sampleBody);
            const txt = generateCustomerTXT(customer, '000150');
            const fields = txt.split('\t');
            expect(fields[22]).toBe('2'); // 取引区分: 現金
            expect(fields[23]).toBe('3'); // 単価種類: 売上単価２
        });

        it('メールアドレスが設定される', () => {
            const customer = parseFormrunEntry(sampleBody);
            const txt = generateCustomerTXT(customer, '000150');
            const fields = txt.split('\t');
            expect(fields[38]).toBe('nobii.nobee.coffee@gmail.com');
        });

        it('購買担当者が代表者と異なる場合メモ1に設定される', () => {
            // 購買担当者が異なるケースをシミュレート
            const body = sampleBody.replace(
                '購買担当者名/姓\n下野\n\n購買担当者名/名\n允絹',
                '購買担当者名/姓\n山田\n\n購買担当者名/名\n太郎'
            );
            const customer = parseFormrunEntry(body);
            expect(customer.buyer).toBe('山田 太郎');

            const txt = generateCustomerTXT(customer, '000150');
            const fields = txt.split('\t');
            expect(fields[14]).toBe('購買担当: 山田 太郎');
        });
    });
});
