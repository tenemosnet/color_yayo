/**
 * fax-parser.js - FAX注文PDF解析モジュール
 * オプティマルライフ社・飛竜社のFAX注文書を解析
 * 画像ベースのPDF（FAXスキャン）はOCR（Tesseract.js）で文字認識
 */

import { loadProductMaster } from '../common/product-master.js';
import { hasVisionApiKey, ocrWithVisionApi } from '../common/vision-api.js';

// 業者別顧客コード
const FAX_CUSTOMERS = {
    OPTIMAL: '000913',    // オプティマルライフ株式会社
    HIRYU: '001564'       // 株式会社飛竜
};

/**
 * FAX PDFファイルを読み込んで注文データを抽出
 * @param {File} file - PDFファイル
 * @returns {Promise<Object>} 解析結果 {customerCode, products, date, companyName, fileName}
 */
export async function readFaxPdfFile(file) {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js が読み込まれていません');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({
        data: arrayBuffer,
        cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
        cMapPacked: true
    }).promise;

    console.log('FAX PDF読み込み完了: ページ数=', pdf.numPages);

    // まずテキスト抽出を試みる
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }

    const trimmedText = fullText.trim();
    console.log('テキスト抽出結果:', trimmedText.length, '文字');

    // テキストが空または極めて少ない場合、OCRを使用
    if (trimmedText.length < 50) {
        console.log('テキスト抽出不十分、OCRを実行します...');
        fullText = await ocrPdfPages(pdf);
        console.log('OCRテキスト（先頭500文字）:', fullText.substring(0, 500));
    } else {
        console.log('抽出テキスト（先頭500文字）:', fullText.substring(0, 500));
    }

    // 業者を判定
    const vendor = detectVendor(fullText);
    console.log('検出された業者:', vendor);

    if (!vendor) {
        throw new Error('FAX注文書の業者を特定できませんでした。オプティマルライフまたは飛竜のFAXか確認してください。');
    }

    // 業者別パーサーで解析
    let result;
    if (vendor === 'OPTIMAL') {
        result = parseOptimalLifePdf(fullText);
    } else if (vendor === 'HIRYU') {
        result = parseHiryuPdf(fullText);
    }

    result.fileName = file.name;
    result.vendor = vendor;

    return result;
}

/**
 * PDFの全ページをOCRで文字認識
 * Google Cloud Vision API優先、未設定/失敗時はTesseract.jsフォールバック
 * @param {Object} pdf - PDF.jsのドキュメントオブジェクト
 * @returns {Promise<string>} OCR結果テキスト
 */
async function ocrPdfPages(pdf) {
    const useVisionApi = hasVisionApiKey();
    console.log(`OCRエンジン: ${useVisionApi ? 'Google Cloud Vision API' : 'Tesseract.js'}`);

    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        console.log(`OCR処理中: ページ ${i}/${pdf.numPages}`);

        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 3.0 });

        // Canvasにレンダリング
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');

        await page.render({
            canvasContext: ctx,
            viewport: viewport
        }).promise;

        // Vision API → Tesseractフォールバック
        let pageText = '';
        if (useVisionApi) {
            try {
                pageText = await ocrWithVisionApi(canvas);
                console.log(`ページ${i} Vision API完了: ${pageText.length}文字`);
            } catch (e) {
                console.warn(`Vision APIエラー、Tesseractにフォールバック:`, e.message);
                pageText = await ocrWithTesseract(canvas, ctx);
            }
        } else {
            pageText = await ocrWithTesseract(canvas, ctx);
        }

        fullText += pageText + '\n';
    }

    return fullText;
}

/**
 * Tesseract.jsでOCR実行
 * @param {HTMLCanvasElement} canvas
 * @param {CanvasRenderingContext2D} ctx
 * @returns {Promise<string>}
 */
async function ocrWithTesseract(canvas, ctx) {
    if (typeof Tesseract === 'undefined') {
        throw new Error('Tesseract.js が読み込まれていません。OCRが必要です。');
    }

    // 画像前処理: グレースケール化＋二値化
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const threshold = 140;
    for (let p = 0; p < data.length; p += 4) {
        const gray = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
        const val = gray < threshold ? 0 : 255;
        data[p] = data[p + 1] = data[p + 2] = val;
    }
    ctx.putImageData(imageData, 0, 0);

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

    const result = await Tesseract.recognize(blob, 'jpn+eng', {
        logger: m => {
            if (m.status === 'recognizing text') {
                console.log(`OCR進捗: ${Math.round(m.progress * 100)}%`);
            }
        }
    });

    console.log(`Tesseract OCR完了: ${result.data.text.length}文字`);
    return result.data.text;
}

/**
 * PDFテキストから業者を判定
 * OCR結果はスペース混入や文字誤認識があるため、柔軟に判定する
 * @param {string} text - PDFから抽出したテキスト
 * @returns {string|null} 'OPTIMAL', 'HIRYU', or null
 */
function detectVendor(text) {
    // OCRのスペース混入対策: スペース除去版も用意
    const noSpace = text.replace(/\s+/g, '');

    console.log('業者判定: スペース除去テキスト（先頭200文字）:', noSpace.substring(0, 200));

    // オプティマルライフ判定
    if (noSpace.includes('オプティマルライフ') || noSpace.includes('オプティマル')
        || noSpace.includes('ｵﾌﾟﾃｨﾏﾙﾗｲﾌ') || noSpace.includes('ｵﾌﾟﾃｨﾏﾙ')
        || text.includes('注文書')) {
        return 'OPTIMAL';
    }

    // 飛竜判定（OCR誤認識対策: HIRYU → HIRYL, H1RYU 等も許容）
    if (noSpace.includes('HIRYU') || noSpace.includes('HIRYL') || /HIR[YV][UL]/i.test(noSpace)
        || noSpace.includes('飛竜')
        || noSpace.includes('商品卸価格表') || noSpace.includes('卸価格表')
        || noSpace.includes('マナウォーター') || noSpace.includes('ピッコロ')
        || noSpace.includes('バンブー')) {
        return 'HIRYU';
    }

    return null;
}

/**
 * オプティマルライフ社のFAX注文書を解析
 * @param {string} text - PDFテキスト（OCR結果含む）
 * @returns {Object} {customerCode, products, date, companyName}
 */
function parseOptimalLifePdf(text) {
    const result = {
        customerCode: FAX_CUSTOMERS.OPTIMAL,
        companyName: 'オプティマルライフ株式会社',
        products: [],
        date: null
    };

    // 日付を抽出
    // パターン1: 令和X年X月X日形式
    const reiwaMatch = text.match(/令和\s*(\d+)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
    if (reiwaMatch) {
        const reiwaYear = parseInt(reiwaMatch[1], 10);
        const westernYear = reiwaYear + 2018;
        const month = reiwaMatch[2].padStart(2, '0');
        const day = reiwaMatch[3].padStart(2, '0');
        result.date = `${westernYear}${month}${day}`;
        console.log('オプティマル日付抽出（令和）:', result.date);
    }

    // パターン2: YYYY/MM/DD または YYYY-MM-DD
    if (!result.date) {
        const dateMatch = text.match(/(20\d{2})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (dateMatch) {
            const year = dateMatch[1];
            const month = dateMatch[2].padStart(2, '0');
            const day = dateMatch[3].padStart(2, '0');
            result.date = `${year}${month}${day}`;
            console.log('オプティマル日付抽出（西暦）:', result.date);
        }
    }

    // パターン3: D26-01-14-1 のような注文NO形式
    if (!result.date) {
        const orderNoMatch = text.match(/D\s*(\d{2})-(\d{2})-(\d{2})/);
        if (orderNoMatch) {
            const year = '20' + orderNoMatch[1];
            const month = orderNoMatch[2];
            const day = orderNoMatch[3];
            result.date = `${year}${month}${day}`;
            console.log('オプティマル日付抽出（注文NO）:', result.date);
        }
    }

    console.log('OCRテキスト全文（解析用）:', text);

    // 年号を除外リストに
    const excludeCodes = new Set(['2025', '2026', '2027', '2028', '2029', '2030']);
    const lines = text.split(/\n/);

    // 方法1: Vision API形式（各フィールドが改行区切り）
    // パターン: 番号行 → コード行 → 品名行 → 数量行 → 備考行
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // 4桁コードだけの行（または先頭が4桁コード）を探す
        const codeMatch = line.match(/^([12]\d{3})$/);
        if (!codeMatch) continue;

        const code = codeMatch[1];
        if (excludeCodes.has(code)) continue;
        if (result.products.find(p => p.code === code)) continue;

        // コード行の後の数行から数量を探す（品名を飛ばして）
        let quantity = null;
        for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
            const nextLine = lines[j].trim();
            // 次の商品コード行に到達したら中断
            if (/^[12]\d{3}$/.test(nextLine)) break;
            // 数量候補: 1〜3桁の数字だけの行
            const qtyMatch = nextLine.match(/^(\d{1,3})$/);
            if (qtyMatch) {
                const num = parseInt(qtyMatch[1], 10);
                if (num >= 1 && num <= 999) {
                    quantity = num;
                    break;
                }
            }
        }

        if (quantity) {
            result.products.push({ code, quantity, unit: '' });
            console.log(`オプティマル商品検出（行解析）: コード=${code}, 数量=${quantity}`);
        }
    }

    // 方法2: コードと数量が同一行にある場合（Tesseract等）
    if (result.products.length === 0) {
        for (const line of lines) {
            const codeMatch = line.match(/\b([12]\d{3})\b/);
            if (!codeMatch) continue;

            const code = codeMatch[1];
            if (excludeCodes.has(code)) continue;
            if (result.products.find(p => p.code === code)) continue;

            const afterCode = line.substring(line.indexOf(code) + code.length);
            const numbersInLine = afterCode.match(/\b(\d{1,3})\b/g);
            if (numbersInLine) {
                for (const numStr of numbersInLine) {
                    const num = parseInt(numStr, 10);
                    if (num >= 1 && num <= 999) {
                        result.products.push({ code, quantity: num, unit: '' });
                        console.log(`オプティマル商品検出（同一行）: コード=${code}, 数量=${num}`);
                        break;
                    }
                }
            }
        }
    }

    // 方法3: 商品名マッチング（フォールバック）
    if (result.products.length === 0) {
        console.log('コードベース抽出失敗。商品名マッチングを試行...');
        const nameMatched = matchProductsByName(text);
        if (nameMatched.length > 0) {
            result.products = nameMatched;
        }
    }

    return result;
}

/**
 * 商品マスタの商品名をOCRテキストから検索してマッチング
 * OCRテキストはスペース混入があるため、スペース除去して比較
 * @param {string} text - OCRテキスト
 * @returns {Array<Object>} マッチした商品 [{code, quantity, unit}]
 */
function matchProductsByName(text) {
    const master = loadProductMaster();
    if (!master) {
        console.log('商品マスタが未読み込みのため、商品名マッチング不可');
        return [];
    }

    const noSpaceText = text.replace(/\s+/g, '');
    const products = [];
    const matchedCodes = new Set();

    console.log(`商品名マッチング開始: マスタ${master.size}件`);

    // 商品マスタの各商品名をOCRテキスト内で探す
    for (const [code, product] of master) {
        const codeNum = parseInt(code, 10);
        if (codeNum < 1000 || codeNum > 2999) continue;
        if (matchedCodes.has(code)) continue;

        const name = product.name;
        if (!name || name.length < 3) continue;

        // 商品名からスペース除去して検索
        const noSpaceName = name.replace(/\s+/g, '');

        // 完全一致 or 主要キーワード（先頭6文字以上）で部分一致
        let found = false;
        if (noSpaceText.includes(noSpaceName)) {
            found = true;
        } else if (noSpaceName.length >= 6) {
            // カタカナ部分や主要部分で部分一致
            const shortName = noSpaceName.substring(0, Math.min(noSpaceName.length, 10));
            if (noSpaceText.includes(shortName)) {
                found = true;
            }
        }

        if (found) {
            console.log(`商品名マッチ: "${name}" → コード=${code}`);
            matchedCodes.add(code);

            // 商品名付近のテキストから数量を探す
            const qty = findQuantityNearName(text, name);
            products.push({
                code: code,
                quantity: qty || 1,  // 数量不明の場合は1
                unit: ''
            });
            console.log(`オプティマル商品検出（名前）: コード=${code}, 数量=${qty || '不明→1'}`);
        }
    }

    return products;
}

/**
 * テキスト内で商品名の近くにある数量を探す
 * @param {string} text - OCRテキスト
 * @param {string} productName - 商品名
 * @returns {number|null} 数量（見つからない場合null）
 */
function findQuantityNearName(text, productName) {
    // 商品名のキーワード（スペース許容）を作成
    const nameChars = productName.replace(/\s+/g, '').split('');
    // 各文字間にオプショナルスペースを入れたパターン
    const flexPattern = nameChars.map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');

    try {
        const regex = new RegExp(flexPattern);
        const match = text.match(regex);
        if (match) {
            // マッチ位置の後ろ100文字以内で数量を探す
            const afterIdx = match.index + match[0].length;
            const afterText = text.substring(afterIdx, afterIdx + 100);
            // 1〜3桁の数字（価格っぽい大きな数字は除外）
            const qtyMatch = afterText.match(/\b(\d{1,2})\b/);
            if (qtyMatch) {
                const qty = parseInt(qtyMatch[1], 10);
                if (qty >= 1 && qty <= 99) {
                    return qty;
                }
            }
        }
    } catch (e) {
        // regex error - skip
    }
    return null;
}

/**
 * 飛竜社のFAX注文書（商品卸価格表）を解析
 * @param {string} text - PDFテキスト（OCR結果含む）
 * @returns {Object} {customerCode, products, date, companyName}
 */
function parseHiryuPdf(text) {
    const result = {
        customerCode: FAX_CUSTOMERS.HIRYU,
        companyName: '株式会社飛竜',
        products: [],
        date: null
    };

    // 日付を抽出
    // FAXヘッダー形式: "26-01-26;09:42" または "26-01-26 09:42"
    const faxDateMatch = text.match(/(\d{2})[\-\/](\d{2})[\-\/](\d{2})[;\s]\s*\d{2}:\d{2}/);
    if (faxDateMatch) {
        const year = '20' + faxDateMatch[1];
        const month = faxDateMatch[2];
        const day = faxDateMatch[3];
        result.date = `${year}${month}${day}`;
        console.log('飛竜日付抽出（FAXヘッダー）:', result.date);
    }

    // 飛竜の価格表は各行に商品情報が並ぶ
    // OCR結果は行単位で解析する
    const lines = text.split(/\n/);
    const processedCodes = new Set();
    const excludeCodes = new Set(['2025', '2026', '2027', '2028', '2029', '2030']);

    for (const line of lines) {
        // カテゴリヘッダー（●で始まる）をスキップ
        if (line.includes('●')) continue;

        // 4桁の商品コードを探す
        const codeMatch = line.match(/\b([12]\d{3})\b/);
        if (!codeMatch) continue;

        const code = codeMatch[1];
        if (excludeCodes.has(code)) continue;
        if (processedCodes.has(code)) continue;

        // 行内の全数字を抽出
        const allNumbers = line.match(/[\d,]+/g);
        if (!allNumbers) continue;

        // カンマ除去してパース
        const parsedNumbers = allNumbers.map(n => parseInt(n.replace(/,/g, ''), 10)).filter(n => !isNaN(n));

        // コード自体を除外
        const codeIndex = parsedNumbers.indexOf(parseInt(code, 10));
        const numbersAfterCode = codeIndex >= 0 ? parsedNumbers.slice(codeIndex + 1) : parsedNumbers;

        if (numbersAfterCode.length < 4) continue;

        console.log(`飛竜解析中: コード=${code}, 数字列=${JSON.stringify(numbersAfterCode)}`);

        // 飛竜の価格表構造:
        // [小売価格税抜, 小売価格税込, 卸価格税抜, 卸価格税込, 卸単位, 摘要, ... 注文数]
        // 価格は数千〜数十万、卸単位は60/70/80/90、注文数は1〜999

        // 注文数は行の末尾付近にある、卸単位(60/70/80/90)より後の数字
        const unitCandidates = [60, 70, 80, 90];
        let foundOrder = false;

        // 卸単位を見つけて、その後の数字を注文数とする
        for (let i = 0; i < numbersAfterCode.length; i++) {
            if (unitCandidates.includes(numbersAfterCode[i])) {
                // 卸単位の後に来る数字が注文数
                for (let j = i + 1; j < numbersAfterCode.length; j++) {
                    const maybeQty = numbersAfterCode[j];
                    if (maybeQty >= 1 && maybeQty <= 999 && !unitCandidates.includes(maybeQty)) {
                        result.products.push({
                            code: code,
                            quantity: maybeQty,
                            unit: ''
                        });
                        processedCodes.add(code);
                        console.log(`飛竜注文検出: コード=${code}, 数量=${maybeQty}`);
                        foundOrder = true;
                        break;
                    }
                }
                break;
            }
        }

        if (foundOrder) continue;

        // フォールバック: 末尾の数字で、価格でないもの
        const lastNum = numbersAfterCode[numbersAfterCode.length - 1];
        const secondLastNum = numbersAfterCode[numbersAfterCode.length - 2];

        // 末尾の数字が1〜999で、その前が卸単位候補（60/70/80/90）なら注文数
        if (lastNum >= 1 && lastNum <= 999 && unitCandidates.includes(secondLastNum)) {
            result.products.push({
                code: code,
                quantity: lastNum,
                unit: ''
            });
            processedCodes.add(code);
            console.log(`飛竜注文検出（末尾）: コード=${code}, 数量=${lastNum}`);
        }
    }

    return result;
}

/**
 * 日付文字列をYYYY-MM-DD形式に変換
 * @param {string} dateStr - YYYYMMDD形式の日付
 * @returns {string} YYYY-MM-DD形式
 */
export function formatDateForInput(dateStr) {
    if (!dateStr || dateStr.length !== 8) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

/**
 * FAX PDFかどうかを判定
 * @param {string} text - PDFから抽出したテキスト
 * @returns {boolean}
 */
export function isFaxPdf(text) {
    return detectVendor(text) !== null;
}

/**
 * 貼り付けテキストから商品コードと数量を抽出
 * PDFビューアからコピペされたテーブルテキストを解析
 * 形式例: "1 1369 アグア万能水 650ml 24 ※2ロット"
 * @param {string} text - 貼り付けテキスト
 * @returns {Array<Object>} [{code, quantity, unit}]
 */
export function parsePastedOrderText(text) {
    const lines = text.split(/\n/);
    const products = [];
    const processedCodes = new Set();

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // 4桁の商品コード（1000-2999）を探す
        const codeMatch = trimmed.match(/\b([12]\d{3})\b/);
        if (!codeMatch) continue;

        const code = codeMatch[1];
        if (processedCodes.has(code)) continue;

        // コードの後ろのテキストから数量を探す
        const afterCode = trimmed.substring(trimmed.indexOf(code) + code.length);
        // 数字を全て抽出（カンマ区切り対応）
        const numbers = afterCode.match(/\b(\d{1,3})\b/g);

        let quantity = 1;
        if (numbers) {
            for (const numStr of numbers) {
                const num = parseInt(numStr, 10);
                // 数量候補: 1〜999
                if (num >= 1 && num <= 999) {
                    quantity = num;
                    break;
                }
            }
        }

        products.push({ code, quantity, unit: '' });
        processedCodes.add(code);
        console.log(`貼付テキスト商品検出: コード=${code}, 数量=${quantity}`);
    }

    return products;
}
