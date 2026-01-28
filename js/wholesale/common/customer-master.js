/**
 * customer-master.js - 卸顧客マスタ管理モジュール
 * 弥生販売の得意先リストから顧客情報を取得
 */

const STORAGE_KEY = 'wholesaleCustomerMaster';

// 顧客マスタデータ（メモリキャッシュ）
let customerMasterCache = null;

/**
 * 得意先リストCSV/Excelを解析
 * @param {string} csvText - CSVテキスト
 * @returns {Map<string, Object>} 顧客コードをキーとしたMap
 */
export function parseCustomerMasterCSV(csvText) {
    // BOM（バイトオーダーマーク）を除去
    if (csvText.charCodeAt(0) === 0xFEFF) {
        csvText = csvText.slice(1);
    }

    const lines = csvText.split(/\r?\n/);
    const customerMap = new Map();

    console.log('顧客マスタ解析開始: 行数=', lines.length);
    console.log('最初の5行:', lines.slice(0, 5).map(l => l.substring(0, 100)));

    // ヘッダー行を探す（行4、0-indexed）
    // 弥生販売の得意先リストは特殊フォーマット:
    // 行0: タイトル行（"得意先リスト"）
    // 行1: 空行
    // 行2: ソート順
    // 行3: 空行
    // 行4: ヘッダー行
    let headerIndex = -1;
    for (let i = 0; i < Math.min(10, lines.length); i++) {
        if (lines[i].includes('コード') && lines[i].includes('名称')) {
            headerIndex = i;
            console.log('ヘッダー行を発見: 行', i);
            break;
        }
    }

    if (headerIndex === -1) {
        throw new Error('顧客マスタのヘッダー行が見つかりません。「コード」と「名称」を含む行があるか確認してください。');
    }

    // ヘッダーからカラムインデックスを特定
    const headers = parseCSVLine(lines[headerIndex]);
    console.log('ヘッダー解析結果:', headers.slice(0, 25));

    // カラムインデックスを検索（部分一致も考慮）
    const indices = {
        code: findColumnIndex(headers, 'コード'),
        name: findColumnIndex(headers, '名称'),
        address1: findColumnIndex(headers, '住所１'),
        tantosha: findColumnIndex(headers, '担当者'),
        tankaSyurui: findColumnIndex(headers, '単価種類'),
        torihikiKubun: findColumnIndex(headers, '取引区分')
    };

    console.log('カラムインデックス:', indices);

    if (indices.code === -1 || indices.name === -1) {
        console.error('必須カラムが見つかりません。ヘッダー:', headers);
        throw new Error('顧客マスタの必須カラム（コード、名称）が見つかりません');
    }

    // データ行を解析
    let debugCount = 0;
    for (let i = headerIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const fields = parseCSVLine(line);
        const code = (fields[indices.code] || '').trim();
        const name = (fields[indices.name] || '').trim();

        // 最初の3件をデバッグ出力
        if (debugCount < 3) {
            console.log(`データ行${i}:`, {
                code: code,
                name: name,
                address1: fields[indices.address1],
                tantosha: fields[indices.tantosha],
                tankaSyurui: fields[indices.tankaSyurui]
            });
            debugCount++;
        }

        if (!code || !name) continue;

        // 住所から都道府県を抽出
        const address1 = (fields[indices.address1] || '').trim();
        const prefecture = extractPrefecture(address1);

        // 担当者コード
        const tantosha = (fields[indices.tantosha] || '').trim();

        // 単価種類（"売上単価１", "売上単価２", "売上単価３"）
        const tankaSyurui = (fields[indices.tankaSyurui] || '').trim();
        const priceType = parsePriceType(tankaSyurui);

        // 取引区分（"掛売", "現金", "都度請求", "サンプル" → 1, 2, 3, 4）
        const torihikiKubunStr = (fields[indices.torihikiKubun] || '').trim();
        const torihikiKubun = parseTorihikiKubun(torihikiKubunStr);

        customerMap.set(code, {
            code,
            name,
            address1,
            prefecture,
            tantosha,
            tankaSyurui,
            priceType,  // 1, 2, or 3
            torihikiKubun  // 1, 2, 3, or 4
        });
    }

    console.log('顧客マスタ解析完了: 顧客数=', customerMap.size);
    return customerMap;
}

/**
 * ヘッダー配列からカラムインデックスを検索
 * @param {string[]} headers - ヘッダー配列
 * @param {string} columnName - 検索するカラム名
 * @returns {number} カラムインデックス（見つからない場合は-1）
 */
function findColumnIndex(headers, columnName) {
    // 完全一致を優先
    const exactIndex = headers.findIndex(h => h === columnName);
    if (exactIndex !== -1) return exactIndex;

    // トリム後の一致
    const trimIndex = headers.findIndex(h => h && h.trim() === columnName);
    if (trimIndex !== -1) return trimIndex;

    // 部分一致（前方一致）
    const partialIndex = headers.findIndex(h => h && h.trim().startsWith(columnName));
    if (partialIndex !== -1) return partialIndex;

    return -1;
}

/**
 * CSVの1行を解析（カンマ区切り、ダブルクォート対応）
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
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
 * 住所から都道府県を抽出
 * @param {string} address - 住所文字列
 * @returns {string} 都道府県名（見つからない場合は空文字）
 */
function extractPrefecture(address) {
    if (!address) return '';

    // 都道府県パターン
    const prefecturePattern = /^(北海道|東京都|大阪府|京都府|.{2,3}県)/;
    const match = address.match(prefecturePattern);
    return match ? match[1] : '';
}

/**
 * 単価種類文字列から数値を抽出
 * @param {string} tankaSyurui - "売上単価１", "売上単価２", "売上単価３"
 * @returns {number} 1, 2, or 3（デフォルトは1）
 */
function parsePriceType(tankaSyurui) {
    if (!tankaSyurui) return 1;

    if (tankaSyurui.includes('２') || tankaSyurui.includes('2')) return 2;
    if (tankaSyurui.includes('３') || tankaSyurui.includes('3')) return 3;
    return 1;
}

/**
 * 取引区分文字列から数値を抽出
 * @param {string} torihikiKubunStr - "掛売", "現金", "都度請求", "サンプル"
 * @returns {number} 1, 2, 3, or 4（デフォルトは1:掛売）
 */
function parseTorihikiKubun(torihikiKubunStr) {
    if (!torihikiKubunStr) return 1;

    if (torihikiKubunStr.includes('現金') || torihikiKubunStr.includes('2') || torihikiKubunStr.includes('２')) return 2;
    if (torihikiKubunStr.includes('都度') || torihikiKubunStr.includes('3') || torihikiKubunStr.includes('３')) return 3;
    if (torihikiKubunStr.includes('サンプル') || torihikiKubunStr.includes('4') || torihikiKubunStr.includes('４')) return 4;
    return 1;  // デフォルト: 掛売
}

/**
 * 顧客マスタをLocalStorageに保存
 */
export function saveCustomerMaster(customerMap) {
    const data = {
        version: '1.0',
        updatedAt: new Date().toISOString(),
        count: customerMap.size,
        customers: Object.fromEntries(customerMap)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    customerMasterCache = customerMap;
}

/**
 * LocalStorageから顧客マスタを読み込み
 * @returns {Map<string, Object>|null}
 */
export function loadCustomerMaster() {
    if (customerMasterCache) {
        return customerMasterCache;
    }

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    try {
        const data = JSON.parse(stored);
        customerMasterCache = new Map(Object.entries(data.customers));
        return customerMasterCache;
    } catch (e) {
        console.error('顧客マスタの読み込みエラー:', e);
        return null;
    }
}

/**
 * 顧客マスタのメタ情報を取得
 */
export function getCustomerMasterInfo() {
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
 * 顧客マスタをクリア
 */
export function clearCustomerMaster() {
    localStorage.removeItem(STORAGE_KEY);
    customerMasterCache = null;
}

/**
 * 会社名で顧客を検索（部分一致）
 * @param {string} searchName - 検索する会社名
 * @returns {Object|null} マッチした顧客情報
 */
export function findCustomerByName(searchName) {
    const master = loadCustomerMaster();
    if (!master || !searchName) return null;

    // 検索用に正規化
    const normalizedSearch = normalizeCompanyName(searchName);

    // 完全一致を優先
    for (const [code, customer] of master) {
        const normalizedName = normalizeCompanyName(customer.name);
        if (normalizedName === normalizedSearch) {
            console.log('顧客マッチ（完全一致）:', customer.name, '→', code);
            return customer;
        }
    }

    // 部分一致
    for (const [code, customer] of master) {
        const normalizedName = normalizeCompanyName(customer.name);
        if (normalizedName.includes(normalizedSearch) || normalizedSearch.includes(normalizedName)) {
            // "×使用しない×" などを除外
            if (customer.name.includes('×')) continue;
            console.log('顧客マッチ（部分一致）:', customer.name, '→', code);
            return customer;
        }
    }

    return null;
}

/**
 * ドメインキーワード→日本語名のマッピング
 * ローマ字ドメインから日本語会社名を検索するため
 */
const domainToNameMapping = {
    'yatsuha': 'やつは',
    'yamazen': '山善',
    // 他のドメイン→日本語名の対応を追加
};

/**
 * メールドメインで顧客を検索
 * @param {string} domain - メールドメイン（例: "yamazen.info"）
 * @returns {Object|null} マッチした顧客情報
 */
export function findCustomerByDomain(domain) {
    const master = loadCustomerMaster();
    if (!master || !domain) return null;

    // ドメインからキーワードを抽出（例: "yamazen.info" → "yamazen"）
    const keyword = domain.split('.')[0].toLowerCase();
    console.log('ドメイン検索: domain=', domain, 'keyword=', keyword);

    // まずローマ字キーワードで直接検索
    for (const [code, customer] of master) {
        const normalizedName = normalizeCompanyName(customer.name).toLowerCase();
        if (normalizedName.includes(keyword)) {
            // "×使用しない×" などを除外
            if (customer.name.includes('×')) continue;
            console.log('顧客マッチ（ドメイン直接）:', domain, '→', customer.name, '→', code);
            return customer;
        }
    }

    // マッピングテーブルから日本語名に変換して検索
    const japaneseName = domainToNameMapping[keyword];
    if (japaneseName) {
        console.log('ドメインマッピング: ', keyword, '→', japaneseName);
        for (const [code, customer] of master) {
            const normalizedName = normalizeCompanyName(customer.name);
            if (normalizedName.includes(japaneseName)) {
                // "×使用しない×" などを除外
                if (customer.name.includes('×')) continue;
                console.log('顧客マッチ（ドメインマッピング）:', domain, '→', japaneseName, '→', customer.name, '→', code);
                return customer;
            }
        }
    }

    console.log('ドメインで顧客が見つかりませんでした:', domain);
    return null;
}

/**
 * 会社名を正規化（比較用）
 * @param {string} name - 会社名
 * @returns {string} 正規化された会社名
 */
function normalizeCompanyName(name) {
    if (!name) return '';

    return name
        // 全角スペース→半角
        .replace(/　/g, ' ')
        // 連続スペースを1つに
        .replace(/\s+/g, ' ')
        // 前後のスペースを除去
        .trim()
        // 株式会社、有限会社などを除去（比較用）
        .replace(/^(株式会社|有限会社|合同会社|㈱|㈲)\s*/g, '')
        .replace(/\s*(株式会社|有限会社|合同会社|㈱|㈲)$/g, '')
        .trim();
}

/**
 * 顧客コードから顧客情報を取得
 * @param {string} code - 顧客コード
 * @returns {Object|null}
 */
export function getCustomerByCode(code) {
    const master = loadCustomerMaster();
    if (!master) return null;
    return master.get(code) || null;
}

/**
 * 顧客マスタファイルを読み込んで保存
 * @param {File} file
 * @returns {Promise<{count: number, message: string}>}
 */
export function loadCustomerMasterFile(file) {
    return new Promise((resolve, reject) => {
        const fileName = file.name.toLowerCase();
        console.log('顧客マスタファイル読み込み開始:', file.name);

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
                    const customerMap = parseCustomerMasterCSV(csvText);
                    saveCustomerMaster(customerMap);
                    resolve({
                        count: customerMap.size,
                        message: `顧客マスタを読み込みました（${customerMap.size}件）`
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
                const customerMap = parseCustomerMasterCSV(e.target.result);
                saveCustomerMaster(customerMap);
                resolve({
                    count: customerMap.size,
                    message: `顧客マスタを読み込みました（${customerMap.size}件）`
                });
            } catch (error) {
                console.error('顧客マスタ解析エラー:', error);
                reject(error);
            }
        };
        reader.onerror = () => {
            reject(new Error('ファイルの読み込みに失敗しました'));
        };
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
