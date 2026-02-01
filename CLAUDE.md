# CLAUDE.md

このファイルは、Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイダンスを提供します。

## プロジェクト概要

カラーミーショップの受注データと卸売注文を弥生販売の売上伝票形式に変換するWebアプリケーション。ブラウザベースのES6 Modulesアプリケーション (v4.2)。ビルド不要。

## コマンド

```bash
npm start                        # 開発サーバー起動（ポート8000、ブラウザ自動起動）
npx http-server -p 8000 -o      # 代替方法
python3 -m http.server 8000     # 代替方法（自動起動なし）
```

**重要**: ローカルサーバー経由で実行必須。`file://`プロトコルではES6 ModulesのCORS制限により動作しない。

テスト・リンター・ビルドステップなし。依存ライブラリはHTML内でCDN読み込み（`xlsx`のみpackage.json）。

## アーキテクチャ

### エントリーポイント

- **index.html** - ランディングページ（小売/卸売選択）
- **retail.html** - カラーミーCSV → 弥生変換（v3.5ワークフロー）
- **wholesale.html** - 卸売注文処理（山善/やつはタブUI）

### モジュール構成

```
js/
├── common/
│   ├── config.js              # 共通設定: 商品マップ、送料コード、代引手数料、YAYOI_FORMAT
│   └── storage.js             # LocalStorage永続化
├── retail/                    # カラーミー → 弥生小売変換
│   ├── main.js                # イベント処理、グローバル状態 (colormeOrders, yayoiCustomers, newCustomersList)
│   ├── parser.js              # Shift-JIS CSV・Excelパース
│   ├── matcher.js             # 顧客マッチング: メール → 電話 → 氏名の優先順
│   ├── converter.js           # 弥生59フィールドTSV生成 + Shift-JISダウンロード
│   └── ui.js                  # UI状態管理
└── wholesale/                 # 卸売注文処理 (v4.0+)
    ├── common/
    │   ├── vision-api.js      # Google Cloud Vision API OCR（APIキーはLocalStorage保存）
    │   ├── customer-master.js # 卸売得意先マスタのパース・検索
    │   └── product-master.js  # 卸売商品マスタ（単価区分別価格対応）
    ├── yamazen/               # 山善: EMLメール + FAX PDF注文
    │   ├── main.js            # オーケストレーター（約1600行）: ファイルアップロード、商品編集、一括変換
    │   ├── eml-parser.js      # EMLパース（Base64/Quoted-Printable、MIMEヘッダー）
    │   ├── fax-parser.js      # FAX PDF OCR: PDF.jsテキスト抽出 → Tesseract.js/Vision APIフォールバック
    │   ├── text-parser.js     # 注文行パース（"商品コード 数量"形式）
    │   └── converter.js       # 弥生59フィールドTSV（納入先コードロジック付き）
    └── yatsuha/               # やつは: PDF添付ファイル抽出
        └── pdf-parser.js
```

### CDN依存ライブラリ（HTML内で読み込み）

- **encoding.js** - Shift-JISエンコード/デコード
- **SheetJS (xlsx.js)** - Excelファイルパース
- **PDF.js** - PDFテキスト抽出
- **Tesseract.js** - FAX画像OCRフォールバック
- **Google Cloud Vision API** - 低品質FAX向けオプションOCR

### データフロー

**小売（2段階ワークフロー）**:
1. カラーミーCSV (Shift-JIS) + 弥生得意先マスタをアップロード → 顧客マッチング（メール→電話→氏名） → 新規顧客TXTエクスポート → 弥生にインポート
2. 注文選択 → セット商品分解 → 送料・代引手数料・クーポン追加 → 弥生59フィールドTSV生成（Shift-JIS、タブ区切り、CRLF）

**卸売**:
1. 取引先別の入力ファイル（EMLメール、FAX PDF、PDF添付）+ 得意先・商品マスタをアップロード
2. 必要に応じてOCR（FAX） → 注文パース → 商品編集テーブル → 確定 → 弥生TSV一括変換

### 主要ビジネスロジック

- **セット商品** (`config.js`): 変換時にバンドル商品を構成品に分解（例: '1229' → ['1221', '1224']）
- **支払/納入コード**: 代引き→'001'+代引手数料行追加、振込→'003'、卸売は得意先別マッピング（山善→'020'、やつは/飛竜→'030'）
- **単価区分別価格**（卸売）: 得意先の`tankaSyurui`で単価区分（price1/price2/price3）を選択
- **出力形式**: 59フィールド、タブ区切り、Shift-JIS、CRLF。フィールド20は'334401'固定、フィールド40は'テネモスショップ'固定

### ファイルエンコーディング

- **入力**: カラーミーCSV (Shift-JIS)、弥生マスタ (CSV UTF-8 BOM または Excel .xlsx)
- **出力**: 全TXTファイル (Shift-JIS、タブ区切り、CRLF)

## 設定

全ビジネスルールは `js/common/config.js` に集約: `APP_VERSION`、`productNameMap`、`setProducts`、`shippingCodes`、`calculateCODFee()`、`YAYOI_FORMAT`定数。
