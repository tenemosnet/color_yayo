/**
 * eml-parser.js 単体テスト
 * multipart/alternative (Gmail base64) メールのデコード
 */
import { describe, it, expect } from 'vitest';
import { parseEmlFile } from '../js/wholesale/parsers/eml-parser.js';

// Gmail形式: multipart/alternative + base64本文
const GMAIL_MULTIPART_EML = `From: =?UTF-8?B?6Zi/6YOo5oW25LuL?= <keisuke@abenatural.com>
Date: Thu, 5 Feb 2026 07:37:04 +0900
Subject: =?UTF-8?B?44Ki44OZ44OK44OB44Ol44Op44Or?=
Content-Type: multipart/alternative; boundary="000000000000ad9035064a0732fa"

--000000000000ad9035064a0732fa
Content-Type: text/plain; charset="UTF-8"
Content-Transfer-Encoding: base64

44OG44ON44Oi44K544ON44OD44OIDQroj4Xljp/mp5gNCg0K44GE44Gk44KC44GK5LiW6Kmx44Gr
44Gq44Gj44Gm44GK44KK44G+44GZ44CCDQoNCuWkp+ixhuOBqOOBiuexs+OBrumFtee0oCA2NTBt
bCDvvJHjg63jg4Pjg4gNCuODk+ODgOOCveODvOODl+ipsOOCgeabv+OBiOeUqCA0MDBtbCDvvJHj
g63jg4Pjg4gNCg0K5rOo5paH44GK6aGY44GE44GE44Gf44GX44G+44GZ44CC
--000000000000ad9035064a0732fa
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: base64

PGRpdj5IVE1M5YaF5a65PC9kaXY+
--000000000000ad9035064a0732fa--
`;

// 369カフェ形式: text/plain + 8bit（従来動作確認）
const PLAIN_TEXT_EML = `From: ayako@369ism.net
Date: Thu, 22 Jan 2026 22:07:49 +0900
Subject: test
Content-Type: text/plain; charset=UTF-8; format=flowed
Content-Transfer-Encoding: 8bit

ポケットピッコロ1ロットお願いします。
`;

// ヒカルランド形式: multipart/mixed + 8bit本文
const MULTIPART_MIXED_8BIT_EML = `From: test@hikaruland.co.jp
Date: Tue, 3 Feb 2026 11:16:15 +0900
Subject: test
Content-Type: multipart/mixed; boundary="----boundary123"

------boundary123
Content-Type: text/plain; charset=UTF-8; format=flowed
Content-Transfer-Encoding: 8bit

ビダウォーターソープ 12個お願いします。
------boundary123--
`;

describe('parseEmlFile', () => {
    it('Gmail multipart/alternative + base64 本文をデコードする', () => {
        const result = parseEmlFile(GMAIL_MULTIPART_EML);
        expect(result.body).toContain('大豆とお米の酵素 650ml');
        expect(result.body).toContain('ビダソープ詰め替え用 400ml');
        expect(result.body).toContain('１ロット');
        expect(result.fromDomain).toBe('abenatural.com');
    });

    it('text/plain + 8bit メールはそのまま本文を返す', () => {
        const result = parseEmlFile(PLAIN_TEXT_EML);
        expect(result.body).toContain('ポケットピッコロ1ロット');
    });

    it('multipart/mixed + 8bit 本文を正しく抽出する', () => {
        const result = parseEmlFile(MULTIPART_MIXED_8BIT_EML);
        expect(result.body).toContain('ビダウォーターソープ 12個');
    });
});
