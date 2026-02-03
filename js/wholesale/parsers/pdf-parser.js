/**
 * pdf-parser.js - やつは様PDF注文書パーサー
 * PDFから商品コードと数量を抽出
 */

/**
 * PDFファイルを読み込んで注文データを抽出
 * @param {File} file - PDFファイル
 * @returns {Promise<Object>} 解析結果
 */
export async function readPdfFile(file) {
    if (typeof pdfjsLib === 'undefined') {
        throw new Error('PDF.js が読み込まれていません');
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    console.log('PDF読み込み完了: ページ数=', pdf.numPages);

    // 全ページのテキストを抽出
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }

    console.log('PDF全文抽出完了');
    console.log('抽出テキスト（先頭500文字）:', fullText.substring(0, 500));

    // 注文データを解析
    const result = parseYatsuhaOrderPdf(fullText);
    result.fileName = file.name;

    return result;
}

/**
 * やつは様注文書PDFのテキストを解析
 * @param {string} text - PDFから抽出したテキスト
 * @returns {Object} 解析結果
 */
function parseYatsuhaOrderPdf(text) {
    const result = {
        date: null,
        companyName: null,
        products: []
    };

    // 日付を抽出（例: 2026年1月28日）
    const dateMatch = text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (dateMatch) {
        const year = dateMatch[1];
        const month = dateMatch[2].padStart(2, '0');
        const day = dateMatch[3].padStart(2, '0');
        result.date = `${year}${month}${day}`;
        console.log('日付抽出:', result.date);
    }

    // 会社名を抽出（「やつは株式会社」など）
    const companyMatch = text.match(/(やつは株式会社|やつは（株）|㈱やつは)/);
    if (companyMatch) {
        result.companyName = 'やつは株式会社';
        console.log('会社名抽出:', result.companyName);
    }

    // テーブルデータを解析
    // PDFのテーブル構造: コード 商品名 小売価格 卸価格 卸単位 数量(摘要)
    // 数量は摘要欄にあり、数字のみの場合が注文対象

    // テキストを行に分割して解析
    const lines = text.split(/\s+/);
    console.log('トークン数:', lines.length);

    // 商品コードと数量のペアを探す
    // パターン: 4桁の数字（商品コード）の後に、商品名、価格などが続き、
    // 最後に数量（摘要欄）がある

    // より正確な解析のため、テキスト全体から商品コードと摘要を抽出
    result.products = extractOrderedProducts(text);

    console.log('抽出された注文商品:', result.products);

    return result;
}

/**
 * 注文商品を抽出（摘要欄に数量があるもの）
 * @param {string} text - PDFテキスト
 * @returns {Array} 商品リスト
 */
function extractOrderedProducts(text) {
    const products = [];

    // PDFのテーブル構造を解析
    // 各行は: コード 商品名 小売価格 卸価格 卸単位 摘要(数量)

    // 商品コードのパターン（4桁数字）
    // 摘要欄の数量パターン（行末の数字）

    // テキストを正規化して解析しやすくする
    const normalizedText = text.replace(/\s+/g, ' ');

    // 商品行を検出するパターン
    // コード(4桁) + 商品名 + 価格群 + 数量(摘要)
    // 例: "1110 ビダクリームノーマルレフィル(30ml) 2,640 1,584 12 48"

    // 注文対象商品コードと数量のマッピング
    // PDFの構造から、摘要欄に数字がある行を抽出

    // 既知の注文パターンを検出
    const orderPatterns = [
        // コード + ... + 数量（摘要欄）のパターン
        /\b(1\d{3})\b[^0-9]*(?:\d{1,3},?\d{3})[^0-9]*(?:\d{1,3},?\d{3})[^0-9]*(\d{1,2})[^0-9]+(\d{1,3})\b/g,
    ];

    // より単純なアプローチ: 既知の商品コードと数量を直接探す
    // PDFのテーブルでは、摘要欄（最後の列）に数量がある行が注文対象

    // テキスト全体から「コード ... 数量」のパターンを探す
    // 摘要欄のパターン: 行の最後にある単独の数字（消費税8%などを除く）

    // 行ごとに解析
    const lines = text.split(/[\n\r]+/);

    for (const line of lines) {
        // 商品コード（4桁、1で始まる）を探す
        const codeMatch = line.match(/\b(1\d{3})\b/);
        if (!codeMatch) continue;

        const code = codeMatch[1];

        // セクションヘッダー（●で始まる）は除外
        if (line.includes('●')) continue;

        // 摘要欄の数量を探す（行末付近の数字）
        // 価格や単位数量ではない、独立した数字を探す

        // 行を数字で分割して最後の数字を取得
        const numbers = line.match(/\b\d+\b/g);
        if (!numbers || numbers.length < 4) continue;

        // 最後の数字が摘要欄の数量の可能性が高い
        // ただし、「消費税8%」などのパターンを除外
        const lastNum = numbers[numbers.length - 1];
        const secondLastNum = numbers[numbers.length - 2];

        // 卸単位数量（6, 12, 20など）と異なる数字が摘要欄
        // または、摘要欄の位置にある数字

        // 簡易判定: 行末の数字で、価格（カンマ付き大きな数字）でないもの
        if (parseInt(lastNum) > 0 && parseInt(lastNum) <= 999) {
            // 既に追加済みでないか確認
            if (!products.find(p => p.code === code)) {
                // 数量が卸単位と同じ場合は注文ではない可能性がある
                // → PDFを見ると、摘要欄（数量）がある行のみが注文対象
                // 今回は摘要欄の数字がある行を注文と判断
            }
        }
    }

    // フォールバック: PDFの画像解析結果から直接マッピング
    // 今回のPDFサンプルから確認できた注文:
    // 1110: 48, 1111: 12, 1221: 24, 1369: 24, 1396: 6

    // テキスト全体から数量パターンを探す
    const quantityPatterns = [
        { code: '1110', pattern: /1110[^0-9]*\d+[^0-9]*\d+[^0-9]*12[^0-9]+(\d+)/i },
        { code: '1111', pattern: /1111[^0-9]*\d+[^0-9]*\d+[^0-9]*12[^0-9]+(\d+)/i },
        { code: '1221', pattern: /1221[^0-9]*\d+[^0-9]*\d+[^0-9]*12[^0-9]+(\d+)/i },
        { code: '1369', pattern: /1369[^0-9]*\d+[^0-9]*\d+[^0-9]*12[^0-9]+(\d+)/i },
        { code: '1396', pattern: /1396[^0-9]*\d+[^0-9]*\d+[^0-9]*6[^0-9]+(\d+)/i },
    ];

    // 汎用的な解析: テキスト内で「コード ... 12|6|4|20|1|3 数量」のパターンを探す
    // 卸単位数量の後に来る数字が摘要（注文数量）

    return parseOrderTable(normalizedText);
}

/**
 * 注文テーブルを解析
 * @param {string} text - 正規化されたテキスト
 * @returns {Array} 商品リスト
 */
export function parseOrderTable(text) {
    const products = [];
    const processedCodes = new Set();

    // 除外すべきコード（日付などから誤検出される可能性）
    const excludeCodes = new Set(['2026', '2025', '2027', '2024', '2028', '2029', '2030']);

    // PDFテーブルの構造:
    // コード 商品名 小売価格 卸価格 卸単位 摘要(数量)
    // 例: 1110 ビダクリームノーマルレフィル(30ml) 2,640 1,584 12 48
    // 例: 1111 ビダクリームまこもレフィル(30ml) 3,190 1,914 12 12 ← 卸単位と数量が同じ
    // 例: 1396 遮光スプレー200ml空容器 800 560 6 6 ← 卸単位と数量が同じ

    // 商品コード（4桁、1または2で始まる）を検出
    const codePattern = /\b([12]\d{3})\b/g;
    let match;

    while ((match = codePattern.exec(text)) !== null) {
        const code = match[1];

        // 除外コード（日付など）をスキップ
        if (excludeCodes.has(code)) continue;

        // 既に処理済みならスキップ
        if (processedCodes.has(code)) continue;

        // コードの後のテキストを取得（次のコードまで）
        const startPos = match.index + match[0].length;
        const nextCodeMatch = text.substring(startPos).match(/\b[12]\d{3}\b/);
        const endPos = nextCodeMatch
            ? startPos + nextCodeMatch.index
            : Math.min(startPos + 200, text.length);

        const segment = text.substring(startPos, endPos);

        // 「消費税8%」「卸8掛」「電話番号」などのパターンを除外
        const cleanedSegment = segment
            .replace(/消費税\d+%/g, '')
            .replace(/卸\d+掛/g, '')
            .replace(/税\d+%/g, '')
            .replace(/TEL[:\s]*[\d\-]+/gi, '')  // 電話番号を除外
            .replace(/\d{2,4}-\d{2,4}-\d{4}/g, '');  // ハイフン区切りの電話番号を除外

        // セグメントから数字を抽出（スペースで区切られた独立した数字）
        const numbers = cleanedSegment.match(/\b\d{1,3}(?:,\d{3})*\b|\b\d+\b/g);
        if (!numbers || numbers.length < 3) continue;

        // 数字を解析（カンマを除去）
        const parsedNumbers = numbers.map(n => parseInt(n.replace(/,/g, ''), 10));

        console.log(`解析中: コード=${code}, 数字列=${JSON.stringify(parsedNumbers)}`);

        // PDFテーブルの構造:
        // [小売価格, 卸価格, 卸単位, (摘要数量)]
        // - 小売価格: 通常 300以上
        // - 卸価格: 通常 小売価格より小さい
        // - 卸単位: 1, 3, 4, 6, 12, 20 など
        // - 摘要数量: あれば注文あり（卸単位の後の数字）

        // 卸単位の候補
        const unitCandidates = [1, 3, 4, 6, 12, 20];

        // パターンマッチング：価格2つ → 卸単位 → 数量？
        let quantity = null;
        let lotSize = null;

        // 数字列から「小売価格, 卸価格, 卸単位, 数量」のパターンを探す
        for (let i = 0; i < parsedNumbers.length - 2; i++) {
            const n1 = parsedNumbers[i];      // 小売価格候補
            const n2 = parsedNumbers[i + 1];  // 卸価格候補
            const n3 = parsedNumbers[i + 2];  // 卸単位候補

            // 価格パターンの検出
            // - 小売価格 >= 300（最低価格ライン）
            // - 卸価格 < 小売価格（卸は安い）
            // - 卸単位は小さい数字（1-20程度）
            if (n1 >= 300 && n2 < n1 && n2 > 0 && unitCandidates.includes(n3)) {
                // 卸単位の後に数字があれば、それが注文数量
                if (i + 3 < parsedNumbers.length) {
                    const n4 = parsedNumbers[i + 3];
                    // 注文数量は通常 1-999
                    if (n4 > 0 && n4 < 1000) {
                        quantity = n4;
                        lotSize = n3;
                        console.log(`  パターン1検出: 小売=${n1}, 卸=${n2}, 単位=${n3}, 数量=${n4}`);
                        break;
                    }
                }
            }
        }

        // パターン2: ヒカルランド形式 [卸価格, 数量, 単位, 金額]
        // 例: 1694, 12, 12, 20328 → 金額 = 卸価格 × 数量 (1694 * 12 = 20328)
        if (quantity === null && parsedNumbers.length >= 4) {
            for (let i = 0; i < parsedNumbers.length - 3; i++) {
                const price = parsedNumbers[i];      // 卸価格
                const qty = parsedNumbers[i + 1];    // 数量
                const unit = parsedNumbers[i + 2];   // 単位
                const amount = parsedNumbers[i + 3]; // 金額

                // 条件: 卸価格 >= 100, 数量 > 0 かつ < 1000, 金額 ≒ 卸価格 × 数量 (±10%許容)
                if (price >= 100 && qty > 0 && qty < 1000 && unitCandidates.includes(unit)) {
                    const expectedAmount = price * qty;
                    const tolerance = expectedAmount * 0.1;
                    if (Math.abs(amount - expectedAmount) <= tolerance) {
                        quantity = qty;
                        lotSize = unit;
                        console.log(`  パターン2検出（ヒカルランド形式）: 卸=${price}, 数量=${qty}, 単位=${unit}, 金額=${amount}`);
                        break;
                    }
                }
            }
        }

        // パターン3: 低価格商品用（800, 560, 6, 6 のようなケース）
        if (quantity === null && parsedNumbers.length >= 4) {
            for (let i = 0; i < parsedNumbers.length - 3; i++) {
                const n1 = parsedNumbers[i];
                const n2 = parsedNumbers[i + 1];
                const n3 = parsedNumbers[i + 2];
                const n4 = parsedNumbers[i + 3];

                // 低価格商品: 小売 >= 100, 卸 < 小売, 卸単位は小さい数字
                if (n1 >= 100 && n2 < n1 && n2 > 0 && unitCandidates.includes(n3) && n4 > 0 && n4 < 1000) {
                    quantity = n4;
                    lotSize = n3;
                    console.log(`  パターン3検出（低価格）: 小売=${n1}, 卸=${n2}, 単位=${n3}, 数量=${n4}`);
                    break;
                }
            }
        }

        // 数量が見つかった場合のみ追加
        if (quantity !== null && quantity > 0) {
            products.push({
                code: code,
                quantity: quantity,
                unit: '',
                lotSize: lotSize
            });
            processedCodes.add(code);
            console.log(`注文検出: コード=${code}, 数量=${quantity}`);
        }
    }

    return products;
}

