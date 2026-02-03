/**
 * product-master.js - 共通商品マスタ管理モジュール
 * 弥生販売の商品リストCSVから単価・分類情報を取得
 * 小売・卸売両方で使用
 */

const STORAGE_KEY = 'productMaster';

// 商品マスタデータ（メモリキャッシュ）
let productMasterCache = null;

/**
 * 商品マスタCSVを解析
 * @param {string} csvText - CSVテキスト
 * @returns {Map<string, Object>} 商品コードをキーとしたMap
 */
export function parseProductMasterCSV(csvText) {
    // BOM（バイトオーダーマーク）を除去
    if (csvText.charCodeAt(0) === 0xFEFF) {
        csvText = csvText.slice(1);
    }

    const lines = csvText.split(/\r?\n/);
    const productMap = new Map();

    console.log('CSV解析開始: 行数=', lines.length);
    console.log('最初の5行:', lines.slice(0, 5));

    // ヘッダー行を探す（5行目、0-indexed で 4）
    // ヘッダー: ,コード,名称,フリガナ,...,税抜売上単価１,税抜売上単価２,...
    let headerIndex = -1;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        console.log(`行${i}: "${lines[i].substring(0, 100)}..."`);
        if (lines[i].includes('コード') && lines[i].includes('税抜売上単価')) {
            headerIndex = i;
            console.log('ヘッダー行を発見: 行', i);
            break;
        }
    }

    if (headerIndex === -1) {
        console.error('ヘッダー行が見つかりません。CSV内容の先頭:', csvText.substring(0, 500));
        throw new Error('商品マスタのヘッダー行が見つかりません。「コード」と「税抜売上単価」を含む行があるか確認してください。');
    }

    // ヘッダーからカラムインデックスを特定
    const headers = parseCSVLine(lines[headerIndex]);
    console.log('ヘッダー解析結果:', headers);

    const codeIndex = headers.findIndex(h => h === 'コード');
    const nameIndex = headers.findIndex(h => h === '名称');
    const category1Index = headers.findIndex(h => h === '分類１');
    const price1Index = headers.findIndex(h => h === '税抜売上単価１');
    const price2Index = headers.findIndex(h => h === '税抜売上単価２');
    const price3Index = headers.findIndex(h => h === '税抜売上単価３');

    console.log('カラムインデックス: コード=', codeIndex, ', 名称=', nameIndex, ', 分類１=', category1Index, ', 税抜売上単価１=', price1Index, ', 税抜売上単価２=', price2Index, ', 税抜売上単価３=', price3Index);

    if (codeIndex === -1 || nameIndex === -1) {
        console.error('必須カラムが見つかりません。ヘッダー:', headers);
        throw new Error('商品マスタの必須カラム（コード、名称）が見つかりません');
    }

    // データ行を解析
    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields = parseCSVLine(line);
        const code = (fields[codeIndex] || '').trim();
        const name = (fields[nameIndex] || '').trim();

        if (!code) continue;

        // 単価を取得（カンマを除去して数値化）
        const price1 = parsePrice(fields[price1Index]);
        const price2 = parsePrice(fields[price2Index]);
        const price3 = parsePrice(fields[price3Index]);

        const category1 = (fields[category1Index] || '').trim();

        productMap.set(code, {
            code,
            name,
            category1,  // 分類１（"07"=食料品 → 軽減税率8%）
            price1,  // 税抜売上単価１
            price2,  // 税抜売上単価２
            price3   // 税抜売上単価３
        });
    }

    return productMap;
}

/**
 * CSVの1行を解析（カンマ区切り、ダブルクォート対応）
 * @param {string} line
 * @returns {string[]}
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                // エスケープされたダブルクォート
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);

    return result;
}

/**
 * 価格文字列を数値に変換
 * @param {string} priceStr - "1,200" や "1200" など
 * @returns {number}
 */
function parsePrice(priceStr) {
    if (!priceStr) return 0;
    // カンマとスペースを除去
    const cleaned = String(priceStr).replace(/[,\s]/g, '').trim();
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 0 : num;
}

/**
 * 商品マスタをLocalStorageに保存
 * @param {Map<string, Object>} productMap
 */
export function saveProductMaster(productMap) {
    const data = {
        version: '1.0',
        updatedAt: new Date().toISOString(),
        count: productMap.size,
        products: Object.fromEntries(productMap)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    productMasterCache = productMap;
}

/**
 * LocalStorageから商品マスタを読み込み
 * @returns {Map<string, Object>|null}
 */
export function loadProductMaster() {
    if (productMasterCache) {
        return productMasterCache;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    try {
        const data = JSON.parse(stored);
        productMasterCache = new Map(Object.entries(data.products));
        return productMasterCache;
    } catch (e) {
        console.error('商品マスタの読み込みエラー:', e);
        return null;
    }
}

/**
 * 商品マスタのメタ情報を取得
 * @returns {Object|null}
 */
export function getProductMasterInfo() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    try {
        const data = JSON.parse(stored);
        return {
            count: data.count,
            updatedAt: data.updatedAt
        };
    } catch (e) {
        return null;
    }
}

/**
 * 商品コードから単価を取得
 * @param {string} code - 商品コード
 * @param {number} priceType - 単価種類（1, 2, or 3）デフォルトは2
 * @returns {number} 単価（見つからない場合は0）
 */
export function getWholesalePrice(code, priceType = 2) {
    const master = loadProductMaster();
    if (!master) return 0;

    const product = master.get(code);
    if (!product) return 0;

    switch (priceType) {
        case 1: return product.price1 || 0;
        case 2: return product.price2 || 0;
        case 3: return product.price3 || 0;
        default: return product.price2 || 0;
    }
}

/**
 * 商品コードから全単価情報を取得
 * @param {string} code - 商品コード
 * @returns {Object|null} {price1, price2, price3}
 */
export function getProductPrices(code) {
    const master = loadProductMaster();
    if (!master) return null;

    const product = master.get(code);
    if (!product) return null;

    return {
        price1: product.price1 || 0,
        price2: product.price2 || 0,
        price3: product.price3 || 0
    };
}

/**
 * 商品コードから分類１を取得
 * @param {string} code - 商品コード
 * @returns {string} 分類１コード（例: "07"=食料品）
 */
export function getProductCategory1(code) {
    const master = loadProductMaster();
    if (!master) return '';

    const product = master.get(code);
    return product ? (product.category1 || '') : '';
}

/**
 * 商品コードから商品名を取得
 * @param {string} code - 商品コード
 * @returns {string} 商品名（見つからない場合は空文字）
 */
export function getProductName(code) {
    const master = loadProductMaster();
    if (!master) return '';

    const product = master.get(code);
    return product ? product.name : '';
}

/**
 * テキストを正規化（検索用）
 * 全角数字→半角、ℓ→リットル、L/l→リットル等
 * @param {string} text
 * @returns {string}
 */
function normalizeForSearch(text) {
    return text
        .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/[ℓＬｌ]/g, 'リットル')
        .replace(/(\d)\s*[Ll]\b/g, '$1リットル')
        .replace(/[　\s]+/g, '')
        .toLowerCase();
}

/**
 * 商品名キーワード検索
 * テキストからキーワードを抽出し、商品マスタ内で全キーワードに一致する商品を返す
 * @param {string} searchText - 検索テキスト（例: "大豆 酵素水 5リットル"）
 * @returns {Array<Object>} マッチした商品配列 [{code, name, score}]
 */
export function searchProductsByText(searchText) {
    const master = loadProductMaster();
    if (!master) return [];

    const normalizedSearch = normalizeForSearch(searchText);
    const results = [];

    // 検索テキストからキーワードを抽出（ループ外で1回だけ）
    const keywords = searchText
        .replace(/[、，,。．.・（）()「」\s　]+/g, ' ')
        .replace(/^お/g, '')       // 先頭の「お」（お米→米）
        .replace(/([^\s])と([^\s])/g, '$1 $2')  // 「AとB」→「A B」
        .replace(/([^\s])の([^\s])/g, '$1 $2')  // 「AのB」→「A B」
        .trim()
        .split(/\s+/)
        .map(k => normalizeForSearch(k))
        .filter(k => k.length > 1);  // 1文字のキーワードは除外

    for (const [code, product] of master) {
        const normalizedName = normalizeForSearch(product.name);

        // 方向1: キーワード → 商品名に含まれるか
        let score = 0;
        if (keywords.length > 0) {
            const matchCount = keywords.filter(kw => normalizedName.includes(kw)).length;
            if (matchCount >= Math.ceil(keywords.length / 2)) {
                score = matchCount;
            }
        }

        // 方向2: 商品名が検索テキストに含まれるか（逆方向マッチ）
        // 例: 検索「ポケットピッコロお願いします」に商品名「ポケットピッコロ」が含まれる
        if (score === 0 && normalizedName.length >= 3 && normalizedSearch.includes(normalizedName)) {
            score = 10;  // 完全包含は高スコア
        }

        if (score > 0) {
            results.push({
                code: product.code,
                name: product.name,
                score: score
            });
        }
    }

    // スコア降順（多くのキーワードにマッチした商品を優先）
    results.sort((a, b) => b.score - a.score);
    return results;
}

/**
 * 商品マスタをクリア
 */
export function clearProductMaster() {
    localStorage.removeItem(STORAGE_KEY);
    productMasterCache = null;
}

/**
 * 商品マスタファイルを読み込んで保存
 * @param {File} file
 * @returns {Promise<{count: number, message: string}>}
 */
export function loadProductMasterFile(file) {
    return new Promise((resolve, reject) => {
        const fileName = file.name.toLowerCase();
        console.log('商品マスタファイル読み込み開始:', file.name, 'サイズ:', file.size, 'bytes');

        // CSV または Excel ファイルをサポート
        if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx')) {
            reject(new Error('CSVまたはExcel(.xlsx)ファイルを選択してください'));
            return;
        }

        // Excelファイルの場合
        if (fileName.endsWith('.xlsx')) {
            console.log('Excelファイルとして処理');
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const csvText = convertExcelToCSV(e.target.result);
                    const productMap = parseProductMasterCSV(csvText);
                    saveProductMaster(productMap);
                    resolve({
                        count: productMap.size,
                        message: `商品マスタを読み込みました（${productMap.size}件）`
                    });
                } catch (error) {
                    console.error('Excel解析エラー:', error);
                    reject(error);
                }
            };
            reader.onerror = () => {
                reject(new Error('Excelファイルの読み込みに失敗しました'));
            };
            reader.readAsArrayBuffer(file);
            return;
        }

        // CSVファイルの場合
        console.log('CSVファイルとして処理');
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                console.log('ファイル読み込み完了: 文字数=', e.target.result.length);
                const productMap = parseProductMasterCSV(e.target.result);
                console.log('CSV解析完了: 商品数=', productMap.size);
                saveProductMaster(productMap);
                resolve({
                    count: productMap.size,
                    message: `商品マスタを読み込みました（${productMap.size}件）`
                });
            } catch (error) {
                console.error('CSV解析エラー:', error);
                reject(error);
            }
        };
        reader.onerror = () => {
            reject(new Error('ファイルの読み込みに失敗しました'));
        };
        // 弥生販売のCSVはUTF-8（BOM付き）
        reader.readAsText(file, 'UTF-8');
    });
}

/**
 * ExcelファイルをCSVテキストに変換
 * @param {ArrayBuffer} arrayBuffer - Excelファイルのバイナリデータ
 * @returns {string} CSV形式のテキスト
 */
function convertExcelToCSV(arrayBuffer) {
    if (typeof XLSX === 'undefined') {
        throw new Error('SheetJS (xlsx.js) が読み込まれていません');
    }

    console.log('Excel→CSV変換開始');
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    console.log('シート名:', firstSheetName);

    const worksheet = workbook.Sheets[firstSheetName];
    const csvText = XLSX.utils.sheet_to_csv(worksheet, {
        FS: ',',
        RS: '\n',
        blankrows: true
    });

    console.log('CSV変換完了、行数:', csvText.split('\n').length);
    return csvText;
}
