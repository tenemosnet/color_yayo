/**
 * eml-parser.js - EMLファイル解析モジュール
 * サンダーバードからドラッグ&ドロップされたEMLファイルを解析
 */

/**
 * EMLファイルからメール本文を抽出
 * @param {string} emlContent - EMLファイルの内容
 * @returns {Object} { body, date, subject, from, fromDomain, organization }
 */
export function parseEmlFile(emlContent) {
    // ヘッダーと本文を分離（空行で区切られる）
    const parts = emlContent.split(/\r?\n\r?\n/);
    const headerPart = parts[0];
    const bodyPart = parts.slice(1).join('\n\n');

    // 日付を抽出
    const date = extractDate(headerPart);

    // 件名を抽出
    const subject = extractSubject(headerPart);

    // From（送信元）を抽出
    const from = extractFrom(headerPart);
    const fromDomain = extractDomainFromEmail(from);

    // Organization（組織名）を抽出
    const organization = extractOrganization(headerPart);

    // Content-TypeとContent-Transfer-Encodingを確認
    const contentType = extractHeader(headerPart, 'Content-Type') || '';
    const encoding = extractHeader(headerPart, 'Content-Transfer-Encoding');

    // 本文をデコード
    let body = bodyPart;

    // multipart メールの場合: text/plain パートを抽出してデコード
    const boundaryMatch = contentType.match(/boundary="?([^"\r\n;]+)"?/i);
    if (boundaryMatch) {
        const boundary = boundaryMatch[1];
        const extracted = extractTextPlainFromMultipart(bodyPart, boundary);
        if (extracted) {
            body = extracted;
        }
    } else if (encoding && encoding.toLowerCase() === 'base64') {
        body = decodeBase64(bodyPart);
    } else if (encoding && encoding.toLowerCase() === 'quoted-printable') {
        body = decodeQuotedPrintable(bodyPart);
    }

    return {
        body: body.trim(),
        date: date,
        subject: subject,
        from: from,
        fromDomain: fromDomain,
        organization: organization
    };
}

/**
 * multipartメールからtext/plainパートを抽出・デコード
 * @param {string} bodyPart - multipartボディ全体
 * @param {string} boundary - MIMEバウンダリ文字列
 * @returns {string|null} デコード済みテキスト（見つからない場合null）
 */
function extractTextPlainFromMultipart(bodyPart, boundary) {
    const parts = bodyPart.split(new RegExp(`--${escapeRegex(boundary)}`));

    for (const part of parts) {
        if (part.trim().startsWith('--') || !part.trim()) continue;

        const headerEndIndex = part.search(/\r?\n\r?\n/);
        if (headerEndIndex === -1) continue;

        const partHeader = part.substring(0, headerEndIndex);
        const partBody = part.substring(headerEndIndex).replace(/^\r?\n\r?\n/, '');

        // text/plain パートを探す
        const ctMatch = partHeader.match(/Content-Type:\s*text\/plain/i);
        if (!ctMatch) continue;

        // Content-Transfer-Encoding を確認
        const encMatch = partHeader.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
        const enc = encMatch ? encMatch[1].trim().toLowerCase() : '';

        if (enc === 'base64') {
            return decodeBase64(partBody);
        } else if (enc === 'quoted-printable') {
            return decodeQuotedPrintable(partBody);
        }
        return partBody;
    }
    return null;
}

/**
 * Fromヘッダーを抽出
 * @param {string} headerPart
 * @returns {string}
 */
function extractFrom(headerPart) {
    const fromRaw = extractHeader(headerPart, 'From');
    if (!fromRaw) return '';
    return decodeMimeHeader(fromRaw);
}

/**
 * メールアドレスからドメインを抽出
 * @param {string} from - "Name <email@domain>" または "email@domain"
 * @returns {string} ドメイン部分
 */
function extractDomainFromEmail(from) {
    if (!from) return '';
    // <email@domain> 形式
    const bracketMatch = from.match(/<([^>]+)>/);
    const email = bracketMatch ? bracketMatch[1] : from;
    // @以降を取得
    const atIndex = email.indexOf('@');
    if (atIndex === -1) return '';
    return email.substring(atIndex + 1).trim();
}

/**
 * Organizationヘッダーを抽出
 * @param {string} headerPart
 * @returns {string}
 */
function extractOrganization(headerPart) {
    const orgRaw = extractHeader(headerPart, 'Organization');
    if (!orgRaw) return '';
    return decodeMimeHeader(orgRaw);
}

/**
 * ヘッダーから特定のフィールドを抽出
 * @param {string} headerPart - ヘッダー部分
 * @param {string} fieldName - フィールド名
 * @returns {string|null}
 */
function extractHeader(headerPart, fieldName) {
    const regex = new RegExp(`^${fieldName}:\\s*(.+?)$`, 'mi');
    const match = headerPart.match(regex);
    return match ? match[1].trim() : null;
}

/**
 * 日付を抽出してYYYYMMDD形式に変換
 * @param {string} headerPart - ヘッダー部分
 * @returns {string} YYYYMMDD形式の日付
 */
function extractDate(headerPart) {
    const dateStr = extractHeader(headerPart, 'Date');
    if (!dateStr) {
        // 日付がない場合は今日の日付を返す
        const today = new Date();
        return formatDate(today);
    }

    try {
        const date = new Date(dateStr);
        return formatDate(date);
    } catch (e) {
        const today = new Date();
        return formatDate(today);
    }
}

/**
 * 日付をYYYYMMDD形式にフォーマット
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

/**
 * 日付をYYYY-MM-DD形式にフォーマット（input[type=date]用）
 * @param {Date} date
 * @returns {string}
 */
export function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 件名を抽出（MIMEエンコードをデコード）
 * @param {string} headerPart - ヘッダー部分
 * @returns {string}
 */
function extractSubject(headerPart) {
    const subjectRaw = extractHeader(headerPart, 'Subject');
    if (!subjectRaw) return '';

    return decodeMimeHeader(subjectRaw);
}

/**
 * MIMEエンコードされたヘッダーをデコード
 * @param {string} encoded
 * @returns {string}
 */
function decodeMimeHeader(encoded) {
    // =?UTF-8?B?...?= 形式（Base64）
    const base64Regex = /=\?([^?]+)\?[Bb]\?([^?]+)\?=/g;
    let decoded = encoded.replace(base64Regex, (match, charset, data) => {
        try {
            return decodeBase64(data);
        } catch (e) {
            return match;
        }
    });

    // =?UTF-8?Q?...?= 形式（Quoted-Printable）
    const qpRegex = /=\?([^?]+)\?[Qq]\?([^?]+)\?=/g;
    decoded = decoded.replace(qpRegex, (match, charset, data) => {
        try {
            return decodeQuotedPrintable(data.replace(/_/g, ' '));
        } catch (e) {
            return match;
        }
    });

    return decoded;
}

/**
 * Base64デコード
 * @param {string} data
 * @returns {string}
 */
function decodeBase64(data) {
    try {
        // 改行を除去
        const cleaned = data.replace(/[\r\n\s]/g, '');
        const binary = atob(cleaned);
        // UTF-8としてデコード
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
        console.error('Base64 decode error:', e);
        return data;
    }
}

/**
 * Quoted-Printableデコード
 * @param {string} data
 * @returns {string}
 */
function decodeQuotedPrintable(data) {
    try {
        // =XX 形式をデコード
        const decoded = data.replace(/=([0-9A-Fa-f]{2})/g, (match, hex) => {
            return String.fromCharCode(parseInt(hex, 16));
        });
        // ソフト改行を除去
        return decoded.replace(/=\r?\n/g, '');
    } catch (e) {
        console.error('Quoted-Printable decode error:', e);
        return data;
    }
}

/**
 * EMLファイルを読み込んで解析
 * @param {File} file - EMLファイル
 * @returns {Promise<Object>} { body, date, subject, attachments }
 */
export function readEmlFile(file) {
    return new Promise((resolve, reject) => {
        if (!file.name.toLowerCase().endsWith('.eml')) {
            reject(new Error('EMLファイル（.eml）を選択してください'));
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const emlContent = e.target.result;
                const result = parseEmlFile(emlContent);

                // 添付ファイルを抽出
                result.attachments = extractAttachments(emlContent);

                resolve(result);
            } catch (error) {
                reject(new Error(`EMLファイルの解析に失敗しました: ${error.message}`));
            }
        };
        reader.onerror = () => {
            reject(new Error('ファイルの読み込みに失敗しました'));
        };
        reader.readAsText(file, 'UTF-8');
    });
}

/**
 * EMLファイルから添付ファイルを抽出
 * @param {string} emlContent - EMLファイルの内容
 * @returns {Array} 添付ファイルの配列 [{ filename, contentType, data }]
 */
function extractAttachments(emlContent) {
    const attachments = [];

    // Content-Typeからboundaryを取得
    const boundaryMatch = emlContent.match(/boundary="?([^"\r\n;]+)"?/i);
    if (!boundaryMatch) {
        console.log('マルチパートメッセージではありません（boundary なし）');
        return attachments;
    }

    const boundary = boundaryMatch[1];
    console.log('MIME boundary:', boundary);

    // boundaryで分割
    const parts = emlContent.split(new RegExp(`--${escapeRegex(boundary)}`));

    for (let i = 1; i < parts.length; i++) {
        const part = parts[i];

        // 終了マーカー（--）をスキップ
        if (part.trim().startsWith('--')) continue;

        // ヘッダーと本文を分離
        const headerEndIndex = part.search(/\r?\n\r?\n/);
        if (headerEndIndex === -1) continue;

        const partHeader = part.substring(0, headerEndIndex);
        const partBody = part.substring(headerEndIndex).replace(/^\r?\n\r?\n/, '');

        // Content-Typeを確認
        const contentTypeMatch = partHeader.match(/Content-Type:\s*([^\r\n;]+)/i);
        const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : '';

        // Content-Dispositionを確認（attachment または filename）
        const dispositionMatch = partHeader.match(/Content-Disposition:\s*([^\r\n]+)/i);
        const disposition = dispositionMatch ? dispositionMatch[1] : '';

        // ファイル名を取得
        let filename = '';
        const filenameMatch = partHeader.match(/filename="?([^"\r\n;]+)"?/i)
            || partHeader.match(/name="?([^"\r\n;]+)"?/i);
        if (filenameMatch) {
            filename = decodeMimeHeader(filenameMatch[1].trim());
        }

        // PDFファイルを検出
        const isPdf = contentType.toLowerCase().includes('application/pdf')
            || filename.toLowerCase().endsWith('.pdf');

        if (isPdf && filename) {
            console.log('PDF添付ファイルを検出:', filename);

            // Content-Transfer-Encodingを確認
            const encodingMatch = partHeader.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
            const encoding = encodingMatch ? encodingMatch[1].trim().toLowerCase() : '';

            // Base64デコード
            let data = null;
            if (encoding === 'base64') {
                data = decodeBase64ToArrayBuffer(partBody);
            }

            if (data) {
                attachments.push({
                    filename: filename,
                    contentType: contentType,
                    data: data  // ArrayBuffer
                });
                console.log('PDF添付ファイルを抽出:', filename, data.byteLength, 'bytes');
            }
        }
    }

    return attachments;
}

/**
 * 正規表現用にエスケープ
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Base64をArrayBufferにデコード
 * @param {string} base64 - Base64エンコードされたデータ
 * @returns {ArrayBuffer|null}
 */
function decodeBase64ToArrayBuffer(base64) {
    try {
        // 改行とスペースを除去
        const cleaned = base64.replace(/[\r\n\s]/g, '');
        const binary = atob(cleaned);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    } catch (e) {
        console.error('Base64 to ArrayBuffer decode error:', e);
        return null;
    }
}
