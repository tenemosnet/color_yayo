import { describe, it, expect } from 'vitest';
import { normalizeName, matchDepositsToOrders } from '../js/retail/bank-matcher.js';

describe('normalizeName', () => {
    it('全角カタカナを半角カタカナに変換する', () => {
        expect(normalizeName('ヤマダ タロウ')).toBe('ﾔﾏﾀﾞﾀﾛｳ');
    });

    it('半角カタカナはそのまま維持する', () => {
        expect(normalizeName('ｵｵｻｶ ｶﾖｺ')).toBe('ｵｵｻｶｶﾖｺ');
    });

    it('漢字名のスペースを除去する', () => {
        expect(normalizeName('山田　太郎')).toBe('山田太郎');
        expect(normalizeName('山田 太郎')).toBe('山田太郎');
    });

    it('空文字列を処理する', () => {
        expect(normalizeName('')).toBe('');
        expect(normalizeName(null)).toBe('');
    });
});

describe('matchDepositsToOrders', () => {
    // テスト用注文データ
    const mockOrders = [
        {
            customerName: '山田　太郎',
            furigana: 'ヤマダ タロウ',
            paymentMethod: '銀行振込',
            paymentFee: 0,
            shippingFee: 500,
            discountAmount: 0,
            items: [{ subtotal: 3000 }]
        },
        {
            customerName: '鈴木　花子',
            furigana: 'スズキ ハナコ',
            paymentMethod: '銀行振込',
            paymentFee: 0,
            shippingFee: 700,
            discountAmount: 0,
            items: [{ subtotal: 5000 }]
        },
        {
            customerName: '佐藤　一郎',
            furigana: 'サトウ イチロウ',
            paymentMethod: '代引き',
            paymentFee: 330,
            shippingFee: 500,
            discountAmount: 0,
            items: [{ subtotal: 2000 }]
        },
        {
            customerName: '高橋　美咲',
            furigana: 'タカハシ ミサキ',
            paymentMethod: '銀行振込',
            paymentFee: 0,
            shippingFee: 500,
            discountAmount: 0,
            items: [{ subtotal: 4800 }]
        }
    ];

    it('金額+名前一致でconfirmedになる（半角カナ振込）', () => {
        const deposits = [
            { date: '2026-01-10', amount: 3500, type: '振込', name: 'ﾔﾏﾀﾞ ﾀﾛｳ' }
        ];
        const result = matchDepositsToOrders(deposits, mockOrders);

        expect(result.matches.get(0).status).toBe('confirmed');
        expect(result.summary.confirmed).toBe(1);
    });

    it('金額+名前一致でconfirmedになる（漢字名送金）', () => {
        const deposits = [
            { date: '2026-01-10', amount: 5700, type: '送金', name: '鈴木　花子' }
        ];
        const result = matchDepositsToOrders(deposits, mockOrders);

        expect(result.matches.get(1).status).toBe('confirmed');
    });

    it('金額のみ一致でcandidateになる', () => {
        const deposits = [
            { date: '2026-01-10', amount: 3500, type: '振込', name: 'ﾀﾅｶ ｼﾞﾛｳ' }
        ];
        const result = matchDepositsToOrders(deposits, mockOrders);

        expect(result.matches.get(0).status).toBe('candidate');
        expect(result.summary.candidate).toBe(1);
    });

    it('代引き注文は照合対象外', () => {
        const deposits = [
            { date: '2026-01-10', amount: 2830, type: '振込', name: 'ｻﾄｳ ｲﾁﾛｳ' }
        ];
        const result = matchDepositsToOrders(deposits, mockOrders);

        // 佐藤（代引き）はマッチしない
        expect(result.matches.has(2)).toBe(false);
    });

    it('金額も名前も不一致の場合はマッチしない', () => {
        const deposits = [
            { date: '2026-01-10', amount: 9999, type: '振込', name: 'ﾌﾒｲ ﾀﾛｳ' }
        ];
        const result = matchDepositsToOrders(deposits, mockOrders);

        expect(result.matches.size).toBe(0);
        expect(result.summary.unmatched).toBe(3); // 代引き除く3件
    });

    it('サマリーが正しく集計される', () => {
        const deposits = [
            { date: '2026-01-10', amount: 3500, type: '振込', name: 'ﾔﾏﾀﾞ ﾀﾛｳ' },      // confirmed
            { date: '2026-01-11', amount: 5700, type: '送金', name: '鈴木　花子' },       // confirmed
            { date: '2026-01-12', amount: 5300, type: '振込', name: 'ﾌﾒｲ ﾀﾛｳ' },        // candidate（金額一致、名前不一致）
        ];
        const result = matchDepositsToOrders(deposits, mockOrders);

        expect(result.summary.confirmed).toBe(2);
        expect(result.summary.candidate).toBe(1);
        expect(result.summary.unmatched).toBe(0);
        expect(result.summary.total).toBe(3); // 代引き除く
    });

    it('1つの入金は1つの注文にのみマッチする', () => {
        // 同額の注文が2つあっても、1入金は1注文のみ
        const sameAmountOrders = [
            {
                customerName: '田中　次郎',
                furigana: 'タナカ ジロウ',
                paymentMethod: '銀行振込',
                paymentFee: 0,
                shippingFee: 500,
                discountAmount: 0,
                items: [{ subtotal: 3000 }]
            },
            {
                customerName: '田中　三郎',
                furigana: 'タナカ サブロウ',
                paymentMethod: '銀行振込',
                paymentFee: 0,
                shippingFee: 500,
                discountAmount: 0,
                items: [{ subtotal: 3000 }]
            }
        ];
        const deposits = [
            { date: '2026-01-10', amount: 3500, type: '振込', name: 'ﾀﾅｶ ｼﾞﾛｳ' }
        ];
        const result = matchDepositsToOrders(deposits, sameAmountOrders);

        // 田中次郎のみconfirmed、三郎はマッチしない
        expect(result.matches.get(0).status).toBe('confirmed');
        expect(result.matches.has(1)).toBe(false);
    });
});
