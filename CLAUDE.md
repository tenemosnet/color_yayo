# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

カラーミーショップの受注データと卸売注文を弥生販売の売上伝票形式に変換するWebアプリケーション。ブラウザベースのES6 Modulesアプリケーション。ビルド不要。

## コマンド

```bash
npm start                        # 開発サーバー起動（ポート8000、ブラウザ自動起動）
npm test                         # テスト実行（vitest run）
npm run test:watch               # テスト監視モード
npx vitest run test/converter.test.js  # 単一テスト実行
```

**重要**: ローカルサーバー経由で実行必須。`file://`プロトコルではES6 ModulesのCORS制限により動作しない。

## アーキテクチャ

### エントリーポイント

- **index.html** - ランディングページ（小売/卸売選択）
- **retail.html** - カラーミーCSV → 弥生変換（小売2段階ワークフロー）
- **wholesale.html** - 卸売注文処理（取引先タブUI）

### モジュール構成

```
js/
├── common/
│   ├── config.js              # 全ビジネスルール集約: 商品マップ、セット商品、送料コード、代引手数料、YAYOI_FORMAT
│   └── storage.js             # LocalStorage永続化
├── retail/                    # カラーミー → 弥生小売変換
│   ├── main.js                # イベント処理、グローバル状態
│   ├── parser.js              # Shift-JIS CSV・Excelパース
│   ├── matcher.js             # 顧客マッチング: メール → 電話 → 氏名の優先順
│   ├── converter.js           # 弥生59フィールドTSV生成 + Shift-JISダウンロード
│   └── ui.js                  # UI状態管理
└── wholesale/                 # 卸売注文処理（レジストリベースアーキテクチャ）
    ├── registry.js            # 取引先定義の一元管理（VENDORS）。新規取引先はここに追加
    ├── main.js                # オーケストレーター: ファイルアップロード、商品編集、一括変換
    ├── converter.js           # 弥生59フィールドTSV生成（卸売共通）
    ├── common/
    │   ├── vision-api.js      # Google Cloud Vision API OCR（APIキーはLocalStorage保存）
    │   ├── customer-master.js # 卸売得意先マスタのパース・検索
    │   └── product-master.js  # 卸売商品マスタ（単価区分別価格対応）
    └── parsers/               # 注文形式別パーサー（取引先共通）
        ├── eml-parser.js      # EMLパース（Base64/Quoted-Printable、MIME）
        ├── fax-parser.js      # FAX PDF OCR: PDF.js → Vision APIフォールバック
        ├── pdf-parser.js      # PDF添付ファイル抽出
        └── text-parser.js     # 注文行パース（"商品コード 数量"形式）
```

### 卸売レジストリパターン

取引先ごとの設定は `js/wholesale/registry.js` の `VENDORS` オブジェクトで一元管理。各エントリに得意先コード、納入先コード、検出方法（`eml`/`pdf-text`/`fax`）、ドメイン情報を定義。新規取引先追加時はレジストリにエントリを追加し、テスト（`test/registry.test.js`）のVENDORS数を更新する。

### データフロー

**小売（2段階ワークフロー）**:
1. カラーミーCSV (Shift-JIS) + 弥生得意先マスタ → 顧客マッチング → 新規顧客TXTエクスポート → 弥生にインポート
2. 注文選択 → セット商品分解 → 送料・代引手数料・クーポン追加 → 弥生TSV生成

**卸売**:
1. 入力ファイル（EML/FAX PDF/PDF）+ 得意先・商品マスタ → レジストリで取引先自動判定
2. OCR（必要時） → 注文パース → 商品編集テーブル → 確定 → 弥生TSV一括変換

### 主要ビジネスロジック

- **セット商品** (`config.js`): バンドル商品を構成品に分解（例: '1229' → ['1221', '1224']）
- **支払/納入コード**: 代引き→'001'+代引手数料行、振込→'003'、卸売は`VENDORS`定義の`nounyuCode`を使用
- **単価区分別価格**（卸売）: 得意先の`tankaSyurui`で単価区分（price1/price2/price3）を選択
- **軽減税率**: 商品マスタの分類１="07"（食料品）→ 8%（×1.08）、それ以外 → 10%（×1.10）。弥生TSV課税区分: 軽減=30、標準=13
- **商品名マッチング**: コードなしメール注文は商品マスタのキーワード検索で自動マッチ（text-parser.js + product-master.js `searchProductsByText`）
- **出力形式**: 59フィールド、タブ区切り、Shift-JIS、CRLF。フィールド20='334401'、フィールド40='テネモスショップ'

### ファイルエンコーディング

- **入力**: カラーミーCSV (Shift-JIS)、弥生マスタ (CSV UTF-8 BOM または Excel .xlsx)
- **出力**: 全TXTファイル (Shift-JIS、タブ区切り、CRLF)

### テスト

テストは `test/` ディレクトリに配置。vitest使用。テストファイルは `*.test.js` 命名規則。`test/fixtures/` にテスト用データ。
