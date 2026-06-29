/**
 * fax-parser.js - FAX注文PDF解析モジュール
 * オプティマルライフ社・飛竜社のFAX注文書を解析
 * 画像ベースのPDF（FAXスキャン）はOCR（Tesseract.js）で文字認識
 */

import { loadProductMaster, searchProductsByText } from '../../common/product-master.js';
import { hasVisionApiKey, ocrWithVisionApi } from '../common/vision-api.js';
import { getFaxCustomerCodes } from '../registry.js';

// 業者別顧客コード（レジストリから取得）
const FAX_CUSTOMERS = getFaxCustomerCodes();

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
    let annotations = null;
    let canvases = [];
    if (trimmedText.length < 50) {
        console.log('テキスト抽出不十分、OCRを実行します...');
        // 座標情報付きでOCR（飛竜の手書き数量検出用）
        const ocrResult = await ocrPdfPages(pdf, { withAnnotations: true });
        fullText = ocrResult.text;
        annotations = ocrResult.annotations;
        canvases = ocrResult.canvases || [];
        console.log('OCRテキスト（先頭500文字）:', fullText.substring(0, 500));
        console.log('アノテーション数:', annotations.length);
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
        result = await parseHiryuPdf(fullText, annotations, canvases);
    }

    result.fileName = file.name;
    result.vendor = vendor;

    return result;
}

/**
 * PDFの全ページをOCRで文字認識
 * Google Cloud Vision API優先、未設定/失敗時はTesseract.jsフォールバック
 * @param {Object} pdf - PDF.jsのドキュメントオブジェクト
 * @param {Object} options - オプション
 * @param {boolean} options.withAnnotations - 座標情報付きアノテーションも返す
 * @returns {Promise<string|Object>} テキスト、またはwithAnnotations時は {text, annotations}
 */
async function ocrPdfPages(pdf, options = {}) {
    const useVisionApi = hasVisionApiKey();
    console.log(`OCRエンジン: ${useVisionApi ? 'Google Cloud Vision API' : 'Tesseract.js'}`);

    let fullText = '';
    let allAnnotations = [];
    let canvases = [];

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
                if (options.withAnnotations) {
                    const result = await ocrWithVisionApi(canvas, { withAnnotations: true });
                    pageText = result.text;
                    allAnnotations = allAnnotations.concat(result.annotations);
                } else {
                    pageText = await ocrWithVisionApi(canvas);
                }
                console.log(`ページ${i} Vision API完了: ${pageText.length}文字`);
            } catch (e) {
                console.warn(`Vision APIエラー、Tesseractにフォールバック:`, e.message);
                pageText = await ocrWithTesseract(canvas, ctx);
            }
        } else {
            pageText = await ocrWithTesseract(canvas, ctx);
        }

        fullText += pageText + '\n';
        if (options.withAnnotations) {
            canvases.push(canvas);
        }
    }

    if (options.withAnnotations) {
        return { text: fullText, annotations: allAnnotations, canvases };
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
            // 数量候補: 行頭が1〜3桁の数字（後に非数字または行末）
            const qtyMatch = nextLine.match(/^(\d{1,3})(?:\D|$)/);
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

    // 方法2: コードと数量が同一行または次行にある場合 — 方法1で漏れた商品を補完
    // OCR環境差でコードが行単独にならない場合に対応
    const foundCodes = new Set(result.products.map(p => p.code));
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const codeMatch = line.match(/\b([12]\d{3})\b/);
        if (!codeMatch) continue;

        const code = codeMatch[1];
        if (excludeCodes.has(code)) continue;
        if (foundCodes.has(code)) continue;

        // コード以降のテキストから、備考（※）より前の最後の数字を数量とする
        const afterCode = line.substring(line.indexOf(code) + code.length);
        const beforeRemark = afterCode.split(/※/)[0];
        const numbersInLine = beforeRemark.match(/\b(\d{1,3})\b/g);
        let quantity = null;
        if (numbersInLine) {
            // 最後の数字を数量として採用（品名中の数字を避ける）
            const num = parseInt(numbersInLine[numbersInLine.length - 1], 10);
            if (num >= 1 && num <= 999) {
                quantity = num;
            }
        }

        // 同一行に数量がない場合、次の数行から数量を前方検索
        // OCRで「1110 Vidaクリーム ノーマルレフィル」と「12」が別行になるケース対応
        if (quantity === null) {
            for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
                const nextLine = lines[j].trim();
                // 次の商品コード行に到達したら中断
                if (/\b[12]\d{3}\b/.test(nextLine)) break;
                // 数量候補: 行頭が1〜3桁の数字
                const qtyMatch = nextLine.match(/^(\d{1,3})(?:\D|$)/);
                if (qtyMatch) {
                    const num = parseInt(qtyMatch[1], 10);
                    if (num >= 1 && num <= 999) {
                        quantity = num;
                        break;
                    }
                }
            }
        }

        if (quantity !== null) {
            result.products.push({ code, quantity, unit: '' });
            foundCodes.add(code);
            console.log(`オプティマル商品検出（同一行補完）: コード=${code}, 数量=${quantity}`);
        }
    }

    // 方法3: 商品名マッチング — コード読取漏れを品名で補完
    // OCRでコードが誤読（線が細い「0」→「O」等）されても、品名で拾い直す
    // 偽陽性防止: OCRテキスト内にコードが存在する商品のみ追加（品名だけの一致では追加しない）
    const nameMatched = matchProductsByName(text);
    if (nameMatched.length > 0) {
        const existingCodes = new Set(result.products.map(p => p.code));
        // OCRテキストからスペース除去版を用意（コード存在チェック用）
        const noSpaceFullText = text.replace(/\s+/g, '');
        for (const nm of nameMatched) {
            if (existingCodes.has(nm.code)) continue;
            // コードがOCRテキスト内に存在するか確認（偽陽性フィルタ）
            if (!noSpaceFullText.includes(nm.code)) {
                console.log(`オプティマル品名補完スキップ（コード未検出）: コード=${nm.code}`);
                continue;
            }
            result.products.push(nm);
            existingCodes.add(nm.code);
            console.log(`オプティマル商品検出（品名補完）: コード=${nm.code}, 数量=${nm.quantity}`);
        }
    }

    // 方法4: コード空欄行の品名検索補完
    // テーブル行番号(1-12)の直後に4桁コードなく品名がある行を検出し
    // searchProductsByText でコードを推定して追加する
    {
        const existingCodesM4 = new Set(result.products.map(p => p.code));
        const existingNamesM4 = new Set(result.products.map(p => p.originalName || ''));

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // 行番号行を検出: 1〜12の整数のみ
            if (!/^\d{1,2}$/.test(line)) continue;
            const rowNum = parseInt(line, 10);
            if (rowNum < 1 || rowNum > 12) continue;

            // 次行確認
            const nextIdx = i + 1;
            if (nextIdx >= lines.length) continue;
            const nextLine = lines[nextIdx].trim();

            // 次行が4桁コード（1000-2999）→ 方法1/2でカバー済み → スキップ
            if (/^[12]\d{3}$/.test(nextLine)) continue;

            // 偽陽性フィルタ
            if (!nextLine) continue;                          // 空行
            if (/^\d+$/.test(nextLine)) continue;             // 純数字（数量行・次の行番号）
            if (nextLine.startsWith('※')) continue;           // 備考行
            if (excludeCodes.has(nextLine.trim())) continue;  // 年号除外
            // 日本語文字（ひらがな/カタカナ/漢字/全角）を含まない行は除外（ヘッダー・英数行等）
            if (!/[\u3040-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]/.test(nextLine)) continue;

            const candidateName = nextLine;
            if (existingNamesM4.has(candidateName)) continue;

            // searchProductsByText で品名→コード変換
            const matches = searchProductsByText(candidateName);
            if (!matches || matches.length === 0) continue;

            const best = matches[0];
            // スコア閾値100: キーワード全一致(100点) or 逆引きマッチ(150/200点)のみ自動採用
            // 50-99点（キーワード半数一致）は偽陽性リスクがあるため除外
            if (best.score < 100) continue;
            if (existingCodesM4.has(best.code)) continue;

            // 品名行の後から数量を探す
            let quantity = null;
            for (let j = nextIdx + 1; j < Math.min(nextIdx + 5, lines.length); j++) {
                const scanLine = lines[j].trim();
                // 次の行番号行（1〜12）に達したら中断
                if (/^\d{1,2}$/.test(scanLine) && parseInt(scanLine, 10) >= 1 && parseInt(scanLine, 10) <= 12) break;
                // 次の商品コード行に達したら中断
                if (/^[12]\d{3}$/.test(scanLine)) break;
                // 備考行（※）はスキップして数量探索を続行
                if (scanLine.startsWith('※')) continue;
                // 数量候補: 行頭が1〜3桁の数字
                const qtyMatch = scanLine.match(/^(\d{1,3})(?:\D|$)/);
                if (qtyMatch) {
                    const num = parseInt(qtyMatch[1], 10);
                    if (num >= 1 && num <= 999) { quantity = num; break; }
                }
            }

            // 数量不明の場合は追加しない（数量1での誤登録リスク回避）
            if (quantity === null) {
                console.log(`オプティマル方法4スキップ（数量不明）: "${candidateName}" → コード=${best.code}`);
                continue;
            }

            result.products.push({
                code: best.code,
                quantity,
                unit: '',
                nameMatched: true,
                originalName: candidateName
            });
            existingCodesM4.add(best.code);
            existingNamesM4.add(candidateName);
            console.log(`オプティマル商品検出（方法4・コード空欄補完）: "${candidateName}" → コード=${best.code}(score=${best.score}), 数量=${quantity}`);
        }
    }

    // 全方法で集めた商品をOCRテキスト内の出現順にソート（注文書の記載順を再現）
    if (result.products.length > 1) {
        const noSpaceText = text.replace(/\s+/g, '');
        result.products.sort((a, b) => {
            // nameMatched商品はコードがOCRテキストにないため、品名のテキスト位置を使う
            const textA = a.nameMatched ? (a.originalName || '').replace(/\s+/g, '') : a.code;
            const textB = b.nameMatched ? (b.originalName || '').replace(/\s+/g, '') : b.code;
            const posA = noSpaceText.indexOf(textA);
            const posB = noSpaceText.indexOf(textB);
            // indexOf が -1（見つからない）の場合は末尾扱い
            return (posA === -1 ? Number.MAX_SAFE_INTEGER : posA) - (posB === -1 ? Number.MAX_SAFE_INTEGER : posB);
        });
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
 * 座標情報付きアノテーションを使用して「注文数」列を特定し、
 * 手書き注文数量のみを正確に抽出する
 * @param {string} text - PDFテキスト（OCR結果含む）
 * @param {Array|null} annotations - Vision APIアノテーション（座標付き単語リスト）
 * @param {Array} canvases - レンダリング済みCanvasの配列（列クロップ再OCR用）
 * @returns {Object} {customerCode, products, date, companyName}
 */
async function parseHiryuPdf(text, annotations, canvases = []) {
    const result = {
        customerCode: FAX_CUSTOMERS.HIRYU,
        companyName: '株式会社飛竜',
        products: [],
        date: null
    };

    // 日付を抽出
    const faxDateMatch = text.match(/(\d{2})[\-\/](\d{2})[\-\/](\d{2})[;:\s]\s*\d{2}:\d{2}/);
    if (faxDateMatch) {
        const year = '20' + faxDateMatch[1];
        const month = faxDateMatch[2];
        const day = faxDateMatch[3];
        result.date = `${year}${month}${day}`;
        console.log('飛竜日付抽出（FAXヘッダー）:', result.date);
    }

    console.log('飛竜OCRテキスト全文:', text);

    // 座標ベースの解析（Vision APIアノテーションがある場合）
    if (annotations && annotations.length > 0) {
        console.log('飛竜: 座標ベース解析開始、アノテーション数:', annotations.length);
        const coordProducts = await parseHiryuByCoordinates(annotations, canvases);
        if (coordProducts.length > 0) {
            result.products = coordProducts;
            return result;
        }
        console.log('飛竜: 座標ベース解析で商品0件、テキストベースにフォールバック');
    }

    // フォールバック: テキストベース解析（座標なし時）
    result.products = parseHiryuByText(text);

    if (result.products.length === 0) {
        console.log('飛竜: 商品抽出0件');
    }

    return result;
}

/**
 * 座標ベースで飛竜注文書を解析（2列×y座標マッチング方式）
 *
 * 飛竜価格表の列構造:
 *   コード | 商品名 | 小売価格(税抜) | 小売価格(税込) | 卸価格(税込) | 卸単位 | 掛率 | 摘要 | 注文数
 *
 * 戦略: Vision APIの1回のOCR結果から、「コード」列と「注文数」列のx帯を特定し、
 * 各列内のアノテーションだけを抽出。同じy座標（同一行）の商品コードと注文数をペアリングする。
 * これにより価格・掛率など他列のテキストに惑わされない。
 *
 * @param {Array} annotations - Vision API textAnnotations（フルページ）
 * @param {Array} canvases - レンダリング済みCanvasの配列（互換性のため残すが未使用）
 * @returns {Promise<Array<Object>>} [{code, quantity, unit}]
 */
async function parseHiryuByCoordinates(annotations, canvases) {
    const products = [];
    const excludeCodes = new Set(['2025', '2026', '2027', '2028', '2029', '2030']);

    // 座標ヘルパー
    const getXLeft = (ann) => {
        const v = ann.boundingPoly?.vertices;
        if (!v || v.length < 1) return null;
        return v[0].x;
    };
    const getXRight = (ann) => {
        const v = ann.boundingPoly?.vertices;
        if (!v || v.length < 2) return null;
        return v[1].x;
    };
    const getXCenter = (ann) => {
        const v = ann.boundingPoly?.vertices;
        if (!v || v.length < 2) return null;
        return (v[0].x + v[1].x) / 2;
    };
    const getYCenter = (ann) => {
        const v = ann.boundingPoly?.vertices;
        if (!v || v.length < 4) return null;
        return (v[0].y + v[2].y) / 2;
    };
    const getHeight = (ann) => {
        const v = ann.boundingPoly?.vertices;
        if (!v || v.length < 4) return null;
        return Math.abs(v[2].y - v[0].y);
    };

    // --- Step 1: 列ヘッダーからx帯を検出 ---

    // 「コード」ヘッダーのx範囲
    let codeColXLeft = null, codeColXRight = null;
    // 「注文数」ヘッダーのx範囲
    let orderColXLeft = null, orderColXRight = null;

    for (const ann of annotations) {
        const desc = ann.description.replace(/\s/g, '');

        // 「コード」ヘッダー検出
        if (desc === 'コード' && codeColXLeft === null) {
            codeColXLeft = getXLeft(ann);
            codeColXRight = getXRight(ann);
            console.log(`飛竜座標: 「コード」ヘッダー x=${codeColXLeft}〜${codeColXRight}`);
        }

        // 「注文数」ヘッダー検出（1単語で取れる場合）
        if ((desc === '注文数' || desc.includes('注文数')) && orderColXLeft === null) {
            orderColXLeft = getXLeft(ann);
            orderColXRight = getXRight(ann);
            console.log(`飛竜座標: 「注文数」ヘッダー x=${orderColXLeft}〜${orderColXRight}`);
        }
    }

    // 「注文」と「数」が分離して認識された場合
    if (orderColXLeft === null) {
        let orderAnn = null, suuAnn = null;
        for (const ann of annotations) {
            const desc = ann.description.replace(/\s/g, '');
            if (desc === '注文') orderAnn = ann;
            if (desc === '数' && orderAnn) {
                suuAnn = ann;
                break;
            }
        }
        if (orderAnn && suuAnn) {
            orderColXLeft = getXLeft(orderAnn);
            orderColXRight = getXRight(suuAnn);
            console.log(`飛竜座標: 「注文」+「数」ヘッダー x=${orderColXLeft}〜${orderColXRight}`);
        }
    }

    // --- Step 1b: フォールバック ---

    // コード列: ヘッダーが見つからない場合、最初の4桁コードのx位置から推定
    if (codeColXLeft === null) {
        for (const ann of annotations) {
            const desc = ann.description.trim();
            if (/^[12]\d{3}$/.test(desc) && !excludeCodes.has(desc)) {
                codeColXLeft = getXLeft(ann);
                codeColXRight = getXRight(ann);
                console.log(`飛竜座標: コード列フォールバック（最初のコード${desc}）x=${codeColXLeft}〜${codeColXRight}`);
                break;
            }
        }
    }

    // 注文数列: ヘッダーが見つからない場合、ページ右端付近を推定
    if (orderColXLeft === null) {
        let pageMaxX = 0;
        for (const ann of annotations) {
            const xr = getXRight(ann);
            if (xr !== null && xr > pageMaxX) pageMaxX = xr;
        }
        orderColXLeft = pageMaxX * 0.85;
        orderColXRight = pageMaxX;
        console.log(`飛竜座標: 注文数列フォールバック（ページ右端85%〜100%）x=${Math.round(orderColXLeft)}〜${pageMaxX}`);
    }

    if (codeColXLeft === null) {
        console.log('飛竜座標: コード列を特定できず、座標ベース解析中断');
        return products;
    }

    // ページ右端を算出
    let pageMaxX = 0;
    for (const ann of annotations) {
        const xr = getXRight(ann);
        if (xr !== null && xr > pageMaxX) pageMaxX = xr;
    }

    // コード列: ヘッダー幅の50%マージン
    const codeColWidth = codeColXRight - codeColXLeft;
    const codeXMin = codeColXLeft - codeColWidth * 0.5;
    const codeXMax = codeColXRight + codeColWidth * 0.5;

    // 注文数列: 最右列のため、ヘッダー左端からページ右端まで全域をカバー
    const orderXMin = orderColXLeft - 30;
    const orderXMax = pageMaxX;

    console.log(`飛竜座標: コード列x帯=${Math.round(codeXMin)}〜${Math.round(codeXMax)}, 注文数列x帯=${Math.round(orderXMin)}〜${Math.round(orderXMax)}`);

    // --- Step 2: コード列内の商品コードを収集 ---
    const codeAnnotations = [];
    for (const ann of annotations) {
        const desc = ann.description.trim();
        if (!/^[12]\d{3}$/.test(desc)) continue;
        if (excludeCodes.has(desc)) continue;

        const xc = getXCenter(ann);
        const yc = getYCenter(ann);
        if (xc === null || yc === null) continue;

        // コード列のx帯内にあるか
        if (xc >= codeXMin && xc <= codeXMax) {
            codeAnnotations.push({ code: desc, y: yc });
        }
    }
    codeAnnotations.sort((a, b) => a.y - b.y);
    console.log(`飛竜座標: コード列内の商品コード${codeAnnotations.length}件:`, codeAnnotations.map(c => `${c.code}(y=${Math.round(c.y)})`));

    // --- Step 3: 注文数列内の数字を収集（全ページOCRから） ---
    let orderAnnotations = [];
    const debugAllNumbers = []; // デバッグ: 全数字のx,y座標
    for (const ann of annotations) {
        const desc = ann.description.trim().replace(/[,，]/g, '');
        if (!/^\d+$/.test(desc)) continue;
        const num = parseInt(desc, 10);
        if (num < 1 || num > 999) continue;

        const xc = getXCenter(ann);
        const yc = getYCenter(ann);
        if (xc === null || yc === null) continue;

        debugAllNumbers.push({ value: num, x: Math.round(xc), y: Math.round(yc) });

        // 注文数列のx帯内にあるか
        if (xc >= orderXMin && xc <= orderXMax) {
            orderAnnotations.push({ value: num, y: yc });
        }
    }
    console.log(`飛竜座標: 全数字アノテーション(1〜999):`, debugAllNumbers.map(n => `${n.value}(x=${n.x},y=${n.y})`));
    console.log(`飛竜座標: 注文数列内の数字${orderAnnotations.length}件:`, orderAnnotations.map(n => `${n.value}(y=${Math.round(n.y)})`));

    // --- Step 3b: 注文数列に商品行と対応する数字がない場合、クロップ再OCRで手書き数字を検出 ---
    // 商品コードのy範囲内にある注文数をカウント（ヘッダー/フッターの数字を除外）
    const codeYMin = codeAnnotations.length > 0 ? codeAnnotations[0].y - 50 : 0;
    const codeYMax = codeAnnotations.length > 0 ? codeAnnotations[codeAnnotations.length - 1].y + 50 : 0;
    const relevantOrderCount = orderAnnotations.filter(n => n.y >= codeYMin && n.y <= codeYMax).length;
    console.log(`飛竜座標: 商品行y範囲(${Math.round(codeYMin)}〜${Math.round(codeYMax)})内の注文数: ${relevantOrderCount}件`);

    if (relevantOrderCount === 0 && canvases && canvases.length > 0 && hasVisionApiKey()) {
        console.log('飛竜座標: 注文数列に商品行対応の数字なし。手書き数字検出のためクロップ再OCRを実行...');

        const canvas = canvases[0];
        // クロップ範囲: 注文数列ヘッダーの左端 - 余裕 〜 ページ右端
        const cropStartX = Math.max(0, orderColXLeft - 50);
        const cropWidth = canvas.width - cropStartX;

        if (cropWidth > 0) {
            // 手書き文字の認識精度を上げるため、クロップ画像を拡大+コントラスト強調
            const upscale = 3; // 3倍拡大
            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropWidth * upscale;
            cropCanvas.height = canvas.height * upscale;
            const cropCtx = cropCanvas.getContext('2d');

            // 拡大描画（imageSmoothingを無効にしてシャープに）
            cropCtx.imageSmoothingEnabled = false;
            cropCtx.drawImage(canvas, cropStartX, 0, cropWidth, canvas.height, 0, 0, cropCanvas.width, cropCanvas.height);

            // コントラスト強調: グレースケール化 + 二値化（手書き文字を濃くする）
            const imageData = cropCtx.getImageData(0, 0, cropCanvas.width, cropCanvas.height);
            const data = imageData.data;
            const threshold = 180; // やや高めの閾値で薄い手書きも拾う
            for (let p = 0; p < data.length; p += 4) {
                const gray = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
                const val = gray < threshold ? 0 : 255;
                data[p] = data[p + 1] = data[p + 2] = val;
            }
            cropCtx.putImageData(imageData, 0, 0);

            console.log(`飛竜座標: クロップ再OCR実行 (x=${cropStartX}〜${canvas.width}, 元${cropWidth}x${canvas.height}px → ${upscale}倍拡大${cropCanvas.width}x${cropCanvas.height}px)`);

            try {
                const cropResult = await ocrWithVisionApi(cropCanvas, { withAnnotations: true });
                console.log(`飛竜座標: クロップOCR完了: ${cropResult.text.length}文字, アノテーション${cropResult.annotations.length}件`);
                console.log('飛竜座標: クロップOCRテキスト:', cropResult.text);

                // クロップ内の数字アノテーションを収集
                // y座標は拡大倍率で割ってフルページ座標に戻す
                orderAnnotations = [];
                for (const ann of cropResult.annotations) {
                    const desc = ann.description.trim().replace(/[,，]/g, '');
                    if (!/^\d+$/.test(desc)) continue;
                    const num = parseInt(desc, 10);
                    if (num < 1 || num > 999) continue;
                    const yc = getYCenter(ann);
                    if (yc !== null) {
                        orderAnnotations.push({ value: num, y: yc / upscale });
                    }
                }
                orderAnnotations.sort((a, b) => a.y - b.y);
                console.log(`飛竜座標: クロップ内数字${orderAnnotations.length}件:`, orderAnnotations.map(n => `${n.value}(y=${Math.round(n.y)})`));
            } catch (e) {
                console.warn('飛竜座標: クロップOCRエラー:', e.message);
            }
        }
    }

    // --- Step 4: y座標マッチング ---
    // 行高さの推定（商品コードのフォントサイズから）
    let rowTolerance = 30; // デフォルト
    if (codeAnnotations.length >= 2) {
        // 隣接コード間のy差の中央値を行高さとし、その半分を閾値にする
        const yGaps = [];
        for (let i = 1; i < codeAnnotations.length; i++) {
            yGaps.push(codeAnnotations[i].y - codeAnnotations[i - 1].y);
        }
        yGaps.sort((a, b) => a - b);
        const medianGap = yGaps[Math.floor(yGaps.length / 2)];
        rowTolerance = medianGap * 0.5;
        console.log(`飛竜座標: 行間隔中央値=${Math.round(medianGap)}, y閾値=${Math.round(rowTolerance)}`);
    }

    // 掛率値を除外（印刷された掛率が紛れ込む可能性対策）
    const rateValues = new Set([55, 60, 70, 80, 90]);

    const processedCodes = new Set();
    const usedOrders = new Set(); // 同じ注文数を二重に使わない

    for (const codeAnn of codeAnnotations) {
        if (processedCodes.has(codeAnn.code)) continue;

        // y座標が閾値以内の注文数候補を全て取得
        const candidates = [];
        for (let i = 0; i < orderAnnotations.length; i++) {
            if (usedOrders.has(i)) continue;
            const dist = Math.abs(orderAnnotations[i].y - codeAnn.y);
            if (dist <= rowTolerance) {
                candidates.push({ index: i, value: orderAnnotations[i].value, dist });
            }
        }

        if (candidates.length === 0) {
            console.log(`飛竜座標: コード${codeAnn.code}(y=${Math.round(codeAnn.y)})に対応する注文数なし`);
            continue;
        }

        // 掛率値でない候補を優先
        const nonRateCandidates = candidates.filter(c => !rateValues.has(c.value));
        const chosen = nonRateCandidates.length > 0
            ? nonRateCandidates.sort((a, b) => a.dist - b.dist)[0]
            : candidates.sort((a, b) => a.dist - b.dist)[0];

        products.push({ code: codeAnn.code, quantity: chosen.value, unit: '' });
        processedCodes.add(codeAnn.code);
        usedOrders.add(chosen.index);
        console.log(`飛竜注文検出（座標マッチ）: コード=${codeAnn.code}, 数量=${chosen.value}, y差=${Math.round(chosen.dist)}, 候補=${JSON.stringify(candidates.map(c => c.value))}`);
    }

    console.log(`飛竜座標: マッチング結果 ${products.length}件`);
    return products;
}

/**
 * テキストベースで飛竜注文書を解析（フォールバック）
 * @param {string} text
 * @returns {Array<Object>}
 */
function parseHiryuByText(text) {
    const products = [];
    const lines = text.split(/\n/);
    const processedCodes = new Set();
    const excludeCodes = new Set(['2025', '2026', '2027', '2028', '2029', '2030']);
    const unitCandidates = new Set([60, 70, 80, 90]);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const codeMatch = line.match(/\b([12]\d{3})\b/);
        if (!codeMatch) continue;

        const code = codeMatch[1];
        if (excludeCodes.has(code)) continue;
        if (processedCodes.has(code)) continue;

        const allNumbers = [];
        for (let j = i; j < Math.min(i + 15, lines.length); j++) {
            const scanLine = lines[j].trim();
            if (!scanLine) continue;
            if (j > i) {
                const nextCode = scanLine.match(/\b([12]\d{3})\b/);
                if (nextCode && nextCode[1] !== code) break;
            }
            const nums = scanLine.match(/[\d,]+/g);
            if (nums) {
                for (const n of nums) {
                    const parsed = parseInt(n.replace(/,/g, ''), 10);
                    if (!isNaN(parsed)) allNumbers.push(parsed);
                }
            }
        }

        const codeNum = parseInt(code, 10);
        const codeIdx = allNumbers.indexOf(codeNum);
        const numbersAfterCode = codeIdx >= 0 ? allNumbers.slice(codeIdx + 1) : allNumbers;

        for (let k = 0; k < numbersAfterCode.length; k++) {
            if (unitCandidates.has(numbersAfterCode[k])) {
                for (let m = k + 1; m < numbersAfterCode.length; m++) {
                    const maybeQty = numbersAfterCode[m];
                    if (maybeQty >= 1 && maybeQty <= 999 && !unitCandidates.has(maybeQty)) {
                        products.push({ code, quantity: maybeQty, unit: '' });
                        processedCodes.add(code);
                        console.log(`飛竜注文検出（テキスト）: コード=${code}, 数量=${maybeQty}`);
                        break;
                    }
                }
                break;
            }
        }
    }

    return products;
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
