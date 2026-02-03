/**
 * vision-api.js - Google Cloud Vision API OCRモジュール
 * 手書きFAX注文書の高精度OCR用
 */

const STORAGE_KEY = 'gcpVisionApiKey';
const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

/**
 * APIキーをLocalStorageに保存
 * @param {string} apiKey
 */
export function saveVisionApiKey(apiKey) {
    localStorage.setItem(STORAGE_KEY, apiKey.trim());
}

/**
 * APIキーをLocalStorageから取得
 * @returns {string|null}
 */
export function getVisionApiKey() {
    return localStorage.getItem(STORAGE_KEY);
}

/**
 * APIキーが設定済みか
 * @returns {boolean}
 */
export function hasVisionApiKey() {
    const key = getVisionApiKey();
    return !!key && key.length > 0;
}

/**
 * APIキーを削除
 */
export function clearVisionApiKey() {
    localStorage.removeItem(STORAGE_KEY);
}

/**
 * CanvasをGoogle Cloud Vision APIでOCR
 * @param {HTMLCanvasElement} canvas - OCR対象のCanvas
 * @param {Object} options - オプション
 * @param {boolean} options.withAnnotations - 座標情報付きアノテーションも返す
 * @returns {Promise<string|Object>} テキスト、またはwithAnnotations時は {text, annotations}
 */
export async function ocrWithVisionApi(canvas, options = {}) {
    const apiKey = getVisionApiKey();
    if (!apiKey) {
        throw new Error('Google Cloud Vision APIキーが未設定です');
    }

    // Canvas → base64（data URI prefixを除去）
    const base64 = canvas.toDataURL('image/png').replace(/^data:image\/\w+;base64,/, '');

    const requestBody = {
        requests: [{
            image: { content: base64 },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            imageContext: {
                languageHints: ['ja', 'en']
            }
        }]
    };

    console.log('Vision API呼び出し中...');

    const response = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const errorMsg = errorData?.error?.message || `HTTP ${response.status}`;
        throw new Error(`Vision API エラー: ${errorMsg}`);
    }

    const data = await response.json();
    const result = data.responses?.[0];

    if (result?.error) {
        throw new Error(`Vision API エラー: ${result.error.message}`);
    }

    const fullText = result?.fullTextAnnotation?.text || '';
    if (!fullText && result?.textAnnotations?.length > 0) {
        const text = result.textAnnotations[0].description;
        console.log(`Vision API OCR完了: ${text.length}文字`);
        if (options.withAnnotations) {
            return { text, annotations: result.textAnnotations.slice(1) };
        }
        return text;
    }

    console.log(`Vision API OCR完了: ${fullText.length}文字`);

    if (options.withAnnotations) {
        // textAnnotations[0]は全文、[1]以降が個別単語+座標
        const wordAnnotations = result?.textAnnotations?.slice(1) || [];
        return { text: fullText, annotations: wordAnnotations };
    }

    return fullText;
}
