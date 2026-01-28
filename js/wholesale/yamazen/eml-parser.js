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

    // Content-Transfer-Encodingを確認
    const encoding = extractHeader(headerPart, 'Content-Transfer-Encoding');

    // 本文をデコード
    let body = bodyPart;
    if (encoding && encoding.toLowerCase() === 'base64') {
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
 * @returns {Promise<Object>} { body, date, subject }
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
                const result = parseEmlFile(e.target.result);
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
