# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

カラーミーショップの受注データと卸売注文を弥生販売の売上伝票形式に変換するWebアプリケーション。ブラウザベースのES6 Modulesアプリケーション（v6.7）。ビルド不要。

## コマンド

```bash
npm start                        # 開発サーバー起動（ポート8000、ブラウザ自動起動）
npm test                         # テスト実行（vitest run）
npm run test:watch               # テスト監視モード
npx vitest run test/converter.test.js  # 単一テスト実行
npx vitest run -t "パイプライン"        # テスト名でフィルタ実行
```

**重要**: ローカルサーバー経由で実行必須。`file://`プロトコルではES6 ModulesのCORS制限により動作しない。

## デプロイ

GitHub Pagesは `master` ブランチから配信。開発は `v4.0-dev` ブランチで行う。

```bash
# 開発 → 本番反映の流れ
git push origin v4.0-dev
git checkout master && git merge v4.0-dev && git push origin master
git checkout v4.0-dev
```

**注意**: デプロイ後はブラウザキャッシュの問題が発生しやすい。ユーザーには Ctrl+Shift+R（スーパーリロード）を案内すること。

## バージョンアップ時の更新箇所

バージョン番号は以下の全箇所を更新すること:

| ファイル | 場所 |
|----------|------|
| `index.html` | L6 `<title>` タグ |
| `index.html` | L12 `<span class="version">` |
| `README.md` | 1行目のタイトル |
| `README.md` | `## バージョン履歴` に新エントリ追加 |
| `CLAUDE.md` | プロジェクト概要の `（vX.X）` |

## アーキテクチャ

### エントリーポイント

- **index.html** - 統合UI（小売/卸売タブ切替）、共通マスタ読込エリア（アコーディオン式）
- **css/styles.css** - 全スタイル一元管理

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
│   ├── parser.js              # Shift-JIS CSV・Excelパース（配送希望日・配送希望時間も取得）
│   ├── matcher.js             # 顧客マッチング: メール → 電話 → 氏名+住所確認の優先順（同姓同名別人判定）
│   ├── converter.js           # 弥生59フィールドTSV生成 + Shift-JISダウンロード
│   ├── ui.js                  # UI状態管理（受注リスト表示、配送希望・伝票Noトグル）
│   ├── bank-parser.js         # ゆうちょダイレクト入出金明細CSVパース
│   └── bank-matcher.js        # 入金照合ロジック（名前・金額マッチング、Pass 1〜4段階）
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
        ├── text-parser.js     # 注文行パース + 商品名キーワード検索マッチング
        └── formrun-parser.js  # 卸販売店エントリーフォーム → 弥生得意先台帳48フィールド抽出
```

### 卸売レジストリパターン

取引先ごとの設定は `js/wholesale/registry.js` の `VENDORS` オブジェクトで一元管理。各エントリに得意先コード、納入コード、検出方法（`eml`/`pdf-text`/`fax`）、ドメイン情報を定義。

**卸売取引先の追加手順**:
1. `js/wholesale/registry.js` の `VENDORS` にエントリ追加
2. `test/fixtures/eml/` にサンプルEMLファイルを配置
3. `test/integration-pipeline.test.js` に期待結果（商品コード・数量・単位）を追加
4. `test/registry.test.js` のVENDORS数を更新
5. `npm test` で全パターン回帰テスト — 既存取引先のパイプラインが壊れていないことを確認

**納入コード決定ロジック**（`getNounyuCodeByCustomer()`）: 顧客マスタの取引区分に基づいて決定
- 取引区分1（掛売）: 山善='020'、その他='030'（月末締め）
- 取引区分2（現金）: '003'（ゆうちょ振込済）
- 取引区分3（サンプル）・その他: ''（空白）
- 取引区分4（都度請求）: '002'（先行出荷）

**VENDORS個別の納入コード**: レジストリの `nounyuCode` が直接使用される場合もある

### データフロー

**小売（2段階ワークフロー）**:
1. 共通マスタ自動読込 or カラーミーCSV (Shift-JIS) + 弥生得意先マスタ → 顧客マッチング → 新規顧客TXTエクスポート → 弥生にインポート
2. 注文選択 → セット商品分解 → 送料・代引手数料・クーポン追加 → 弥生TSV生成

**卸売**:
1. 入力ファイル（EML/FAX PDF/PDF）+ 共通マスタ → ドメインまたはOCRで取引先自動判定
2. OCR（必要時） → 注文パース（商品名キーワード検索含む） → 商品編集テーブル → 確定 → 弥生TSV一括変換

### 主要ビジネスロジック

- **顧客照合**（`matcher.js`）: メール（優先度1）→ 電話（優先度2）→ 氏名+住所（優先度3）の3段階。優先度3到達時はメール・電話照合失敗済みのため住所確認を実施。住所一致0〜1件→新規扱い、住所一致2件以上→弥生重複登録と判断し最初の1件にマッチ＋警告。住所判定: 都道府県+住所の先頭8文字一致
- **セット商品** (`config.js`): バンドル商品を構成品に分解（例: '1229' → ['1221', '1224']）
- **支払/納入コード**: 代引き→'001'+代引手数料行、振込→'003'、卸売は取引区分ベースで`getNounyuCodeByCustomer()`が決定
- **単価区分別価格**（卸売）: 得意先の`tankaSyurui`で単価区分（price1/price2/price3）を選択。レジストリ未登録取引先は `fallback` オプションで price1→price2→price3 の順に非ゼロ値を探索
- **軽減税率**: 商品マスタの分類１="07"（食料品）→ 8%（×1.08）、それ以外 → 10%（×1.10）。弥生TSV課税区分: 軽減=30、標準=13
- **ロット数量解決**: `unit==="ロット"`の場合、商品マスタの入数(`lotSize`)で実数量に変換。入数未設定時はエラー表示
- **ネコポス判定**（`parser.js`）: 送料385円、または送料0円+商品コード1382（アリビダ）のみ → `order.isNekopos = true`
- **出力形式**: 59フィールド、タブ区切り、Shift-JIS、CRLF。フィールド20='334401'、フィールド40='テネモスショップ'

### 商品名検索スコアリング（`searchProductsByText`）

コードなしメール注文の自動マッチングで使用。検索テキストを `normalizeForSearch` で正規化後、3段階でスコアリング:

**正規化** (`normalizeForSearch`): 全角数字→半角、ℓ/L→リットル、全角括弧→半角括弧、空白除去、lowercase

**スコアリング**:
- **200点**: 双方向マッチ（キーワードが商品名に含まれる＋商品名が検索テキストに含まれる）
- **150点**: 逆引きのみ（商品名全体が検索テキストに含まれる、3文字以上）
- **50〜100点**: キーワード一致率（例: 2/3キーワード一致 → 67点）

**ソート順**: スコア降順 → バイグラム類似度降順 → 商品名長さ昇順（単品優先）

**キーワード分割**: 空白・括弧・中黒で分割、2文字未満は除外

### テキストパーサーのパターン認識（`text-parser.js`）

注文行の認識パターン（優先順）:
1. **コード付き**: `^(\d{4})\s+商品名\s+数量(単位)?$`
2. **コードフォールバック**: `^(\d{4})\s+(.+)$` → 数量1、単位なし
3. **乗算記号**: `[✖✕×xX]\uFE0E?\s*数量$` → 「マナウォーター(中)ステンレス✖︎1」形式
4. **単位付き数量**: `数字+(個|本|台|ケ|ヶ|ケース|セット|箱|袋|パック|ロット|冊)` → 行内の最後のマッチを採用

**除外ロジック**: 署名ブロック（tel/fax/mail行）、引用返信（`>` 行、`On...wrote:` 以降）、挨拶行はスキップ

### ゆうちょ入金照合（`bank-matcher.js`）

5段階パスで注文と入金をペアリング:
- **Pass 1**: 金額+名前完全一致 → confirmed
- **Pass 2**: 名前一致・金額不一致 → amount_mismatch
- **Pass 3**: 金額一致・名前部分一致（ユニーク文字Set重複4文字以上） → candidate
- **Pass 3.5**: 漢字名のみ（カナなし）＋同額未ペア入金が残り1件のみ → candidate
- **Pass 4**: 金額差¥1,000以内・名前部分一致 → candidate

**名前正規化** (`normalizeName`): 旧字体→新字体変換（邉→辺、髙→高、齋→斎等）、小カナ→大カナ正規化

### UIトグル機能（受注リスト）

`ui.js` の `displayOrders()` は以下のトグルボタンで列の表示/非表示を切り替え:
- **予定伝票No** (`denpyoNoMap`): チェック済み注文に対して伝票番号をプレビュー表示
- **配送希望** (`showDeliveryTime`): カラーミーCSVの配送希望日・配送希望時間を表示（B2入力用）

トグル状態は `main.js` のグローバル変数で管理し、`renderOrderList(true)` で再描画。

### ファイルエンコーディング

- **入力**: カラーミーCSV (Shift-JIS)、弥生マスタ (CSV UTF-8 BOM または Excel .xlsx)
- **出力**: 全TXTファイル (Shift-JIS、タブ区切り、CRLF)

### テスト

テストは `test/` ディレクトリに配置。vitest使用（設定はデフォルト）。テストファイルは `*.test.js` 命名規則。

- `test/integration-pipeline.test.js` — 卸売フルパイプライン統合テスト（EML解析→商品抽出→スコアリング）
- `test/product-search.test.js` — 商品名検索のバイグラム類似度テスト
- `test/bank-matcher.test.js` — ゆうちょ入金照合の各パスとエッジケース
- `test/fixtures/eml/` — 取引先別サンプルEMLファイル（回帰テスト用）

**localStorageモック**: 全テスト共通で以下のパターンを使用
```javascript
vi.stubGlobal('localStorage', {
    _store: {},
    getItem(key) { return this._store[key] || null; },
    setItem(key, value) { this._store[key] = value; },
    removeItem(key) { delete this._store[key]; }
});
```
