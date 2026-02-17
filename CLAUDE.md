# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

カラーミーショップの受注データと卸売注文を弥生販売の売上伝票形式に変換するWebアプリケーション。ブラウザベースのES6 Modulesアプリケーション（v5.5）。ビルド不要。

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

- **index.html** - 統合UI（小売/卸売タブ切替）、共通マスタ読込エリア（アコーディオン式）
- **css/styles.css** - 全スタイル一元管理（小売・卸売・共通マスタ・タブ等）

### モジュール構成

```
js/
├── common/                    # 小売/卸売共通モジュール
│   ├── config.js              # 全ビジネスルール集約: 商品マップ、セット商品、送料コード、代引手数料、YAYOI_FORMAT
│   ├── storage.js             # LocalStorage永続化
│   ├── customer-master.js     # 共通得意先マスタ（LocalStorage: customerMaster）
│   └── product-master.js      # 共通商品マスタ（LocalStorage: productMaster）、単価区分別価格・軽減税率対応
├── retail/                    # カラーミー → 弥生小売変換
│   ├── main.js                # イベント処理、共通マスタ自動読込・双方向同期
│   ├── parser.js              # Shift-JIS CSV・Excelパース
│   ├── matcher.js             # 顧客マッチング: メール → 電話 → 氏名の優先順
│   ├── converter.js           # 弥生59フィールドTSV生成 + Shift-JISダウンロード
│   └── ui.js                  # UI状態管理
└── wholesale/                 # 卸売注文処理（レジストリベースアーキテクチャ）
    ├── registry.js            # 取引先定義の一元管理（VENDORS）+ 納入コード決定ロジック
    ├── main.js                # オーケストレーター: ファイルアップロード、商品編集、一括変換
    ├── converter.js           # 弥生59フィールドTSV生成（卸売共通）
    ├── common/
    │   └── vision-api.js      # Google Cloud Vision API OCR（APIキーはLocalStorage保存）
    └── parsers/               # 注文形式別パーサー（取引先共通）
        ├── eml-parser.js      # EMLパース（Base64/Quoted-Printable、MIME）
        ├── fax-parser.js      # FAX PDF OCR: PDF.js → Vision APIフォールバック
        ├── pdf-parser.js      # PDF添付ファイル抽出
        └── text-parser.js     # 注文行パース + 商品名キーワード検索マッチング
```

### 卸売レジストリパターン

取引先ごとの設定は `js/wholesale/registry.js` の `VENDORS` オブジェクトで一元管理。各エントリに得意先コード、検出方法（`eml`/`pdf-text`/`fax`）、ドメイン情報を定義。

**卸売取引先の追加手順**:
1. `js/wholesale/registry.js` の `VENDORS` にエントリ追加
2. `test/fixtures/eml/` にサンプルEMLファイルを配置
3. `test/integration-pipeline.test.js` に期待結果（商品コード・数量・単位）を追加
4. `test/registry.test.js` のVENDORS数を更新
5. `npm test` で全パターン回帰テスト — 既存取引先のパイプラインが壊れていないことを確認

**納入コード決定ロジック**（`getNounyuCodeByCustomer()`）: 取引区分に基づいて決定
- 取引区分1（掛売）: 山善='020'、その他='030'（月末締め）
- 取引区分2（現金）: '003'（ゆうちょ振込済）
- 取引区分3（サンプル）・その他: ''（空白）
- 取引区分4（都度請求）: '002'（先行出荷）

### データフロー

**小売（2段階ワークフロー）**:
1. 共通マスタ自動読込 or カラーミーCSV (Shift-JIS) + 弥生得意先マスタ → 顧客マッチング → 新規顧客TXTエクスポート → 弥生にインポート
2. 注文選択 → セット商品分解 → 送料・代引手数料・クーポン追加 → 弥生TSV生成

**卸売**:
1. 入力ファイル（EML/FAX PDF/PDF）+ 共通マスタ → ドメインまたはOCRで取引先自動判定
2. OCR（必要時） → 注文パース（商品名キーワード検索含む） → 商品編集テーブル → 確定 → 弥生TSV一括変換

### 主要ビジネスロジック

- **セット商品** (`config.js`): バンドル商品を構成品に分解（例: '1229' → ['1221', '1224']）
- **支払/納入コード**: 代引き→'001'+代引手数料行、振込→'003'、卸売は取引区分ベースで`getNounyuCodeByCustomer()`が決定
- **単価区分別価格**（卸売）: 得意先の`tankaSyurui`で単価区分（price1/price2/price3）を選択
- **軽減税率**: 商品マスタの分類１="07"（食料品）→ 8%（×1.08）、それ以外 → 10%（×1.10）。弥生TSV課税区分: 軽減=30、標準=13
- **商品名マッチング**: コードなしメール注文は`searchProductsByText()`で商品マスタをキーワード検索し自動マッチ。3段階ソート: キーワード一致率 → バイグラム類似度 → 商品名長さ昇順（単品優先）
- **ロット数量解決**: `unit==="ロット"`の場合、商品マスタの入数(`lotSize`)で実数量に変換。入数未設定時はエラー表示
- **出力形式**: 59フィールド、タブ区切り、Shift-JIS、CRLF。フィールド20='334401'、フィールド40='テネモスショップ'

### ファイルエンコーディング

- **入力**: カラーミーCSV (Shift-JIS)、弥生マスタ (CSV UTF-8 BOM または Excel .xlsx)
- **出力**: 全TXTファイル (Shift-JIS、タブ区切り、CRLF)

### テスト

テストは `test/` ディレクトリに配置。vitest使用。テストファイルは `*.test.js` 命名規則。

- `test/fixtures/eml/` — 取引先別サンプルEMLファイル（回帰テスト用）
- `test/integration-pipeline.test.js` — 卸売フルパイプライン統合テスト（EML解析→商品抽出→スコアリング）
- `test/product-search.test.js` — 商品名検索のバイグラム類似度テスト
- localStorageモック: `vi.stubGlobal('localStorage', {...})` パターンを使用
