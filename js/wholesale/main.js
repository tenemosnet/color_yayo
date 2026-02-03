/**
 * main.js - 卸売注文メインロジック
 * EML/PDFファイルからの商品抽出、単価入力、弥生TXT出力
 */

import { readEmlFile, formatDateForInput } from './parsers/eml-parser.js';
import { extractProductData, calculateAmount, calculateTotal } from './parsers/text-parser.js';
import { convertToYayoiFormat, downloadAsShiftJIS, getDateString, determineNounyuCode } from './converter.js';
import { loadProductMasterFile, loadProductMaster, getProductMasterInfo, getWholesalePrice, getProductName, getProductCategory1, clearProductMaster } from './common/product-master.js';
import {
    loadCustomerMasterFile,
    loadCustomerMaster,
    getCustomerMasterInfo,
    clearCustomerMaster,
    findCustomerByName,
    findCustomerByDomain,
    findCustomerByEmail,
    getCustomerByCode
} from './common/customer-master.js';
import { shippingCodes } from '../common/config.js';
import { VENDORS } from './registry.js';
import { readPdfFile, parseOrderTable } from './parsers/pdf-parser.js';
import { readFaxPdfFile, parsePastedOrderText } from './parsers/fax-parser.js';
import { saveVisionApiKey, getVisionApiKey, hasVisionApiKey, clearVisionApiKey } from './common/vision-api.js';

// グローバル状態
let currentProducts = [];
let emailDate = null;
let detectedCustomer = null;  // 検出された顧客情報
let currentEmlFileName = '';  // 現在処理中のEMLファイル名
let currentEmailBody = '';    // 現在処理中のメール本文（参照用）

// 確認済み注文リスト
let confirmedOrders = [];

/**
 * 初期化
 */
export function initWholesale() {
    setupEventListeners();
    setDefaultDate();
    checkProductMaster();
    checkCustomerMaster();
}

/**
 * イベントリスナーをセットアップ
 */
function setupEventListeners() {
    // EMLファイルアップロード
    const uploadBox = document.getElementById('yamazenUploadBox');
    const fileInput = document.getElementById('yamazenEmlInput');

    if (uploadBox && fileInput) {
        // クリックでファイル選択
        uploadBox.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'LABEL') {
                fileInput.click();
            }
        });

        // ファイル選択時
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleOrderFile(file);
        });

        // ドラッグ&ドロップ
        uploadBox.addEventListener('dragenter', handleDragEnter);
        uploadBox.addEventListener('dragover', handleDragOver);
        uploadBox.addEventListener('dragleave', handleDragLeave);
        uploadBox.addEventListener('drop', handleDrop);
    }

    // クリアボタン
    document.getElementById('yamazenClearBtn')?.addEventListener('click', handleClear);

    // 確認して追加ボタン
    document.getElementById('yamazenConfirmBtn')?.addEventListener('click', handleConfirmOrder);

    // 注文リスト関連ボタン
    document.getElementById('yamazenSelectAllBtn')?.addEventListener('click', selectAllOrders);
    document.getElementById('yamazenDeselectAllBtn')?.addEventListener('click', deselectAllOrders);
    document.getElementById('yamazenClearOrdersBtn')?.addEventListener('click', removeSelectedOrders);
    document.getElementById('yamazenBatchConvertBtn')?.addEventListener('click', handleBatchConvert);

    // 商品マスタ関連
    const masterInput = document.getElementById('productMasterInput');
    const masterUploadBox = document.getElementById('productMasterUploadBox');

    if (masterInput) {
        masterInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleProductMasterFile(file);
        });
    }

    if (masterUploadBox) {
        masterUploadBox.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'LABEL') {
                masterInput?.click();
            }
        });
        masterUploadBox.addEventListener('dragenter', handleDragEnter);
        masterUploadBox.addEventListener('dragover', handleDragOver);
        masterUploadBox.addEventListener('dragleave', handleDragLeave);
        masterUploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                handleProductMasterFile(files[0]);
            }
        });
    }

    // 商品マスタクリアボタン
    document.getElementById('clearProductMasterBtn')?.addEventListener('click', handleClearProductMaster);

    // 顧客マスタ関連
    const customerMasterInput = document.getElementById('customerMasterInput');
    const customerMasterUploadBox = document.getElementById('customerMasterUploadBox');

    if (customerMasterInput) {
        customerMasterInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleCustomerMasterFile(file);
        });
    }

    if (customerMasterUploadBox) {
        customerMasterUploadBox.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'LABEL') {
                customerMasterInput?.click();
            }
        });
        customerMasterUploadBox.addEventListener('dragenter', handleDragEnter);
        customerMasterUploadBox.addEventListener('dragover', handleDragOver);
        customerMasterUploadBox.addEventListener('dragleave', handleDragLeave);
        customerMasterUploadBox.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files && files.length > 0) {
                handleCustomerMasterFile(files[0]);
            }
        });
    }

    // 顧客マスタクリアボタン
    document.getElementById('clearCustomerMasterBtn')?.addEventListener('click', handleClearCustomerMaster);

    // Vision APIキー設定
    initVisionApiKeyUI();
}

/**
 * Vision APIキー設定UIの初期化
 */
function initVisionApiKeyUI() {
    const input = document.getElementById('visionApiKeyInput');
    const saveBtn = document.getElementById('saveVisionApiKeyBtn');
    const clearBtn = document.getElementById('clearVisionApiKeyBtn');
    const status = document.getElementById('visionApiKeyStatus');

    if (!saveBtn) return;

    // 現在の状態を表示
    updateVisionApiKeyStatus();

    saveBtn.addEventListener('click', () => {
        const key = input.value.trim();
        if (!key) {
            status.textContent = '⚠️ APIキーを入力してください';
            status.style.color = '#e53935';
            return;
        }
        saveVisionApiKey(key);
        input.value = '';
        updateVisionApiKeyStatus();
    });

    clearBtn.addEventListener('click', () => {
        clearVisionApiKey();
        input.value = '';
        updateVisionApiKeyStatus();
    });
}

function updateVisionApiKeyStatus() {
    const status = document.getElementById('visionApiKeyStatus');
    if (!status) return;

    if (hasVisionApiKey()) {
        status.textContent = '✅ APIキー設定済み（Google Cloud Vision APIを使用）';
        status.style.color = '#2e7d32';
    } else {
        status.textContent = '未設定（Tesseract.jsで動作）';
        status.style.color = '#666';
    }
}

/**
 * デフォルト日付を設定
 */
function setDefaultDate() {
    const dateInput = document.getElementById('yamazenOrderDate');
    if (dateInput) {
        dateInput.value = formatDateForInput(new Date());
    }
}

/**
 * ドラッグイベントハンドラ
 */
function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('dragover');
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === e.currentTarget) {
        e.currentTarget.classList.remove('dragover');
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('dragover');

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
        handleOrderFile(files[0]);
    }
}

/**
 * ファイルタイプを判定して適切な処理を実行
 * @param {File} file
 */
async function handleOrderFile(file) {
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.eml')) {
        await handleEmlFile(file);
    } else if (fileName.endsWith('.pdf')) {
        await handlePdfFile(file);
    } else {
        showStatus('EMLまたはPDFファイルを選択してください', 'error');
    }
}

/**
 * EMLファイルを処理
 * @param {File} file
 */
async function handleEmlFile(file) {
    showStatus('ファイルを解析中...', 'info');

    try {
        // EMLファイルを解析
        const emlData = await readEmlFile(file);
        console.log('EML解析結果:', {
            from: emlData.from,
            domain: emlData.fromDomain,
            organization: emlData.organization,
            subject: emlData.subject,
            attachments: emlData.attachments ? emlData.attachments.length : 0
        });

        // PDF添付ファイルがあればPDFパーサーで処理
        if (emlData.attachments && emlData.attachments.length > 0) {
            const pdfAttachment = emlData.attachments.find(a =>
                a.filename.toLowerCase().endsWith('.pdf') ||
                a.contentType.toLowerCase().includes('application/pdf')
            );

            if (pdfAttachment) {
                console.log('PDF添付ファイルを検出、PDFパーサーで処理:', pdfAttachment.filename);
                await handleEmlWithPdfAttachment(file, emlData, pdfAttachment);
                return;
            }
        }

        // ファイル名・メール本文を保存・表示
        currentEmlFileName = file.name;
        currentEmailBody = emlData.body || '';
        displayFileName(file.name);

        // 顧客を検出
        detectedCustomer = detectCustomerFromEml(emlData);
        if (detectedCustomer) {
            console.log('顧客検出成功:', detectedCustomer);
            displayDetectedCustomer(detectedCustomer);
        } else {
            console.warn('顧客を検出できませんでした - 手動設定で続行');
        }

        // 日付を設定
        if (emlData.date) {
            emailDate = emlData.date;
            const dateInput = document.getElementById('yamazenOrderDate');
            if (dateInput && emlData.date.length === 8) {
                // YYYYMMDD → YYYY-MM-DD
                const formatted = `${emlData.date.slice(0,4)}-${emlData.date.slice(4,6)}-${emlData.date.slice(6,8)}`;
                dateInput.value = formatted;
            }
        }

        // 商品データを抽出（テキストメール）
        currentProducts = extractProductData(emlData.body);

        if (currentProducts.length === 0) {
            console.log('商品自動抽出: 0件。Email body:', emlData.body);
        }

        // 商品マスタから単価を自動設定（顧客の単価種類に応じて）
        const priceType = detectedCustomer ? detectedCustomer.priceType : 2;
        currentProducts = applyPricesFromMaster(currentProducts, priceType);

        // 送料行を追加（顧客の都道府県から）- 卸販売は常に送料計上
        if (detectedCustomer && detectedCustomer.prefecture) {
            const shippingCode = shippingCodes[detectedCustomer.prefecture];
            if (shippingCode) {
                const shippingPriceExcludingTax = getWholesalePrice(shippingCode, priceType);
                const shippingPrice = toTaxIncluded(shippingPriceExcludingTax);
                const shippingName = getProductName(shippingCode) || '送料';
                currentProducts.push({
                    code: shippingCode,
                    name: shippingName,
                    quantity: 1,
                    unit: '',
                    unitPrice: shippingPrice,
                    amount: shippingPrice,
                    isShipping: true  // 送料行フラグ
                });
                console.log('送料行追加:', shippingCode, shippingName, `税別${shippingPriceExcludingTax} → 税込${shippingPrice}`);
            }
        }

        // アップロードボックスに完了マーク
        const uploadBox = document.getElementById('yamazenUploadBox');
        if (uploadBox) uploadBox.classList.add('loaded');

        // 商品テーブルを表示
        displayProductTable(currentProducts);

        // 変換セクションを表示
        document.getElementById('yamazenProductSection').style.display = 'block';
        document.getElementById('yamazenConvertSection').style.display = 'block';

        // 担当者コードを自動設定
        if (detectedCustomer && detectedCustomer.tantosha) {
            const tantoshaInput = document.getElementById('yamazenTantousha');
            if (tantoshaInput) tantoshaInput.value = detectedCustomer.tantosha;
        }

        // 商品件数から送料を除外
        const productCount = currentProducts.filter(p => !p.isShipping).length;
        let statusMsg, statusType;
        if (productCount === 0 && !detectedCustomer) {
            statusMsg = '⚠ 顧客未検出・商品自動抽出0件です。メール本文を確認し、手動で設定してください。';
            statusType = 'warning';
        } else if (productCount === 0) {
            statusMsg = `⚠ 商品を自動抽出できませんでした（${detectedCustomer.name}）。メール本文を確認し、手動で追加してください。`;
            statusType = 'warning';
        } else if (!detectedCustomer) {
            statusMsg = `⚠ ${productCount}件の商品を抽出しました（顧客未検出 — 得意先コード等を手動設定してください）`;
            statusType = 'warning';
        } else {
            statusMsg = `✅ ${productCount}件の商品を抽出しました（${detectedCustomer.name}、送料込み）`;
            statusType = 'success';
        }
        showStatus(statusMsg, statusType);

    } catch (error) {
        showStatus(`❌ エラー: ${error.message}`, 'error');
        console.error('EML処理エラー:', error);
    }
}

/**
 * PDFファイルを処理（やつは注文書 / FAX注文書を自動判定）
 * @param {File} file
 */
async function handlePdfFile(file) {
    showStatus('PDFを解析中...（FAXの場合はOCR処理に数十秒かかります）', 'info');

    try {
        // まずFAX PDFとして解析を試みる
        let pdfData;
        let isFax = false;

        try {
            pdfData = await readFaxPdfFile(file);
            isFax = true;
            console.log('FAX PDF解析結果:', pdfData);
        } catch (faxError) {
            // FAX PDFでなければ、やつはPDFパーサーで解析
            console.log('FAX PDFではありません、やつはパーサーで解析:', faxError.message);
            pdfData = await readPdfFile(file);
            console.log('やつはPDF解析結果:', pdfData);
        }

        // ファイル名を保存・表示
        currentEmlFileName = file.name;
        displayFileName(file.name);

        // 顧客を検出
        if (isFax && pdfData.customerCode) {
            // FAX PDF: 顧客コードから直接取得
            detectedCustomer = getCustomerByCode(pdfData.customerCode);
            if (detectedCustomer) {
                console.log('顧客検出成功（FAXコード）:', detectedCustomer);
                displayDetectedCustomer(detectedCustomer);
            } else {
                // 顧客マスタにない場合、会社名で検索
                detectedCustomer = findCustomerByName(pdfData.companyName);
                if (detectedCustomer) {
                    console.log('顧客検出成功（FAX会社名）:', detectedCustomer);
                    displayDetectedCustomer(detectedCustomer);
                }
            }
        } else if (pdfData.companyName) {
            // やつはPDF: 会社名から検索
            detectedCustomer = findCustomerByName(pdfData.companyName);
            if (detectedCustomer) {
                console.log('顧客検出成功:', detectedCustomer);
                displayDetectedCustomer(detectedCustomer);
            }
        }

        if (!detectedCustomer) {
            // 卸販売では顧客特定が必須 - エラーで中断
            console.error('顧客を検出できませんでした - 処理中断');
            showStatus('❌ 顧客を特定できませんでした。顧客マスタにドメイン/会社名が登録されているか確認してください。', 'error');
            return;
        }

        // 日付を設定
        if (pdfData.date) {
            emailDate = pdfData.date;
            const dateInput = document.getElementById('yamazenOrderDate');
            if (dateInput && pdfData.date.length === 8) {
                const formatted = `${pdfData.date.slice(0,4)}-${pdfData.date.slice(4,6)}-${pdfData.date.slice(6,8)}`;
                dateInput.value = formatted;
            }
        }

        // 商品データを取得
        currentProducts = pdfData.products.map(p => ({
            code: p.code,
            name: '',  // 商品マスタから取得
            quantity: p.quantity,
            unit: p.unit || '',
            unitPrice: 0,
            amount: 0
        }));

        if (currentProducts.length === 0 && isFax) {
            // FAX PDFで商品抽出失敗 → テキスト貼り付けUIを表示
            showFaxPasteUI(pdfData);
            return;
        }

        if (currentProducts.length === 0) {
            showStatus('商品データが見つかりませんでした。PDF形式を確認してください。', 'error');
            return;
        }

        // 商品マスタから単価・商品名を自動設定（顧客の単価種類に応じて）
        const priceType = detectedCustomer ? detectedCustomer.priceType : 2;
        currentProducts = applyPricesFromMaster(currentProducts, priceType);

        // 送料行を追加（顧客の都道府県から）- 卸販売は常に送料計上
        if (detectedCustomer && detectedCustomer.prefecture) {
            const shippingCode = shippingCodes[detectedCustomer.prefecture];
            if (shippingCode) {
                const shippingPriceExcludingTax = getWholesalePrice(shippingCode, priceType);
                const shippingPrice = toTaxIncluded(shippingPriceExcludingTax);
                const shippingName = getProductName(shippingCode) || '送料';
                currentProducts.push({
                    code: shippingCode,
                    name: shippingName,
                    quantity: 1,
                    unit: '',
                    unitPrice: shippingPrice,
                    amount: shippingPrice,
                    isShipping: true
                });
                console.log('送料行追加:', shippingCode, shippingName, `税別${shippingPriceExcludingTax} → 税込${shippingPrice}`);
            }
        }

        // アップロードボックスに完了マーク
        const uploadBox = document.getElementById('yamazenUploadBox');
        if (uploadBox) uploadBox.classList.add('loaded');

        // 商品テーブルを表示
        displayProductTable(currentProducts);

        // 変換セクションを表示
        document.getElementById('yamazenProductSection').style.display = 'block';
        document.getElementById('yamazenConvertSection').style.display = 'block';

        // 担当者コードを自動設定
        if (detectedCustomer && detectedCustomer.tantosha) {
            const tantoshaInput = document.getElementById('yamazenTantousha');
            if (tantoshaInput) tantoshaInput.value = detectedCustomer.tantosha;
        }

        // 商品件数から送料を除外
        const productCount = currentProducts.filter(p => !p.isShipping).length;
        const vendorLabel = isFax ? `FAX: ${pdfData.companyName}` : detectedCustomer.name;
        const statusMsg = `✅ ${productCount}件の商品を抽出しました（${vendorLabel}、送料込み）`;
        showStatus(statusMsg, 'success');

    } catch (error) {
        showStatus(`❌ PDFエラー: ${error.message}`, 'error');
        console.error('PDF処理エラー:', error);
    }
}

/**
 * EMLから顧客を検出
 * @param {Object} emlData - EML解析結果
 * @returns {Object|null} 顧客情報
 */
function detectCustomerFromEml(emlData) {
    // 方法1: メールドメインから検索
    if (emlData.fromDomain) {
        const customer = findCustomerByDomain(emlData.fromDomain);
        if (customer) {
            console.log('顧客検出（ドメイン）:', emlData.fromDomain);
            return customer;
        }
    }

    // 方法2: Organizationヘッダーから検索
    if (emlData.organization) {
        const customer = findCustomerByName(emlData.organization);
        if (customer) {
            console.log('顧客検出（Organization）:', emlData.organization);
            return customer;
        }
    }

    // 方法3: メールアドレス完全一致で検索
    if (emlData.from) {
        // From: "Name <email>" からメールアドレス部分を抽出
        const emailMatch = emlData.from.match(/<([^>]+)>/) || emlData.from.match(/([^\s<>]+@[^\s<>]+)/);
        if (emailMatch) {
            const customer = findCustomerByEmail(emailMatch[1]);
            if (customer) {
                console.log('顧客検出（メールアドレス）:', emailMatch[1]);
                return customer;
            }
        }
    }

    // 方法4: メール本文の署名から検索
    const signatureCompany = extractCompanyFromSignature(emlData.body);
    if (signatureCompany) {
        const customer = findCustomerByName(signatureCompany);
        if (customer) {
            console.log('顧客検出（署名）:', signatureCompany);
            return customer;
        }
    }

    return null;
}

/**
 * メール本文の署名から会社名を抽出
 * @param {string} body - メール本文
 * @returns {string|null} 会社名
 */
function extractCompanyFromSignature(body) {
    if (!body) return null;

    // 会社名パターン（株式会社、有限会社など）
    const patterns = [
        /(?:株式会社|㈱)\s*([^\s\n]+)/,
        /([^\s\n]+)\s*(?:株式会社|㈱)/,
        /(?:有限会社|㈲)\s*([^\s\n]+)/,
        /([^\s\n]+)\s*(?:有限会社|㈲)/
    ];

    for (const pattern of patterns) {
        const match = body.match(pattern);
        if (match) {
            return match[0].trim();
        }
    }

    return null;
}

/**
 * 検出された顧客情報を表示
 * @param {Object} customer
 */
function displayDetectedCustomer(customer) {
    const infoElement = document.getElementById('detectedCustomerInfo');
    if (!infoElement) return;

    const priceTypeLabel = {
        1: '売上単価１',
        2: '売上単価２',
        3: '売上単価３'
    };

    infoElement.innerHTML = `
        <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 15px;">
            <h4 style="color: #1976d2; margin: 0 0 10px 0;">🏢 検出された顧客</h4>
            <table style="width: 100%; font-size: 14px;">
                <tr><td style="width: 100px; color: #666;">得意先コード:</td><td><strong>${customer.code}</strong></td></tr>
                <tr><td style="color: #666;">名称:</td><td><strong>${customer.name}</strong></td></tr>
                <tr><td style="color: #666;">担当者:</td><td>${customer.tantosha || '(未設定)'}</td></tr>
                <tr><td style="color: #666;">取引区分:</td><td>${{1:'掛売',2:'現金',3:'都度請求',4:'サンプル'}[customer.torihikiKubun] || '(不明)'}</td></tr>
                <tr><td style="color: #666;">単価種類:</td><td>${priceTypeLabel[customer.priceType] || customer.tankaSyurui}</td></tr>
                <tr><td style="color: #666;">都道府県:</td><td>${customer.prefecture || '(未設定)'}</td></tr>
            </table>
        </div>
    `;
    infoElement.style.display = 'block';
}

/**
 * ファイル名を表示
 * @param {string} filename
 */
function displayFileName(filename) {
    const element = document.getElementById('yamazenFileName');
    if (element) {
        element.textContent = filename;
        element.style.color = '#667eea';
    }
}

/**
 * FAX PDFで商品抽出失敗時のテキスト貼り付けUI
 * ユーザーがPDFビューアからテーブルテキストをコピペして商品を登録
 * @param {Object} pdfData - FAX PDF解析結果（顧客・日付は取得済み）
 */
function showFaxPasteUI(pdfData) {
    showStatus('⚠️ FAX注文書の商品テーブルを自動読取できませんでした。PDFビューアから注文テーブルをコピーして下のテキスト欄に貼り付けてください。', 'error');

    const section = document.getElementById('yamazenProductSection');
    section.style.display = 'block';

    // 貼り付けUIをセクション先頭に挿入
    const existingPasteUI = document.getElementById('faxPasteUI');
    if (existingPasteUI) existingPasteUI.remove();

    const pasteUI = document.createElement('div');
    pasteUI.id = 'faxPasteUI';
    pasteUI.style.cssText = 'margin-bottom: 20px; padding: 15px; border: 2px dashed #667eea; border-radius: 8px; background: #f8f9ff;';
    pasteUI.innerHTML = `
        <h3 style="margin: 0 0 10px 0; color: #667eea;">📋 注文テーブル貼り付け</h3>
        <p style="margin: 0 0 10px 0; font-size: 14px; color: #666;">
            PDFビューアで注文テーブル部分を選択・コピーし、下に貼り付けてください。<br>
            商品コード（4桁）と数量を自動抽出します。
        </p>
        <textarea id="faxPasteText" rows="8" style="width: 100%; font-family: monospace; font-size: 13px; padding: 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;"
            placeholder="例:&#10;1 1369 アグア万能水 650ml 24 ※2ロット&#10;2 1221 ビダウォーターソープ (400ml) 12 ※1ロット"></textarea>
        <button id="faxPasteBtn" class="wholesale-btn" style="margin-top: 10px; padding: 10px 30px;">
            貼り付けテキストから商品を読み取る
        </button>
    `;
    section.insertBefore(pasteUI, section.firstChild);

    document.getElementById('faxPasteBtn').addEventListener('click', () => {
        const text = document.getElementById('faxPasteText').value.trim();
        if (!text) {
            showStatus('テキストを貼り付けてください。', 'error');
            return;
        }

        const products = parsePastedOrderText(text);
        if (products.length === 0) {
            showStatus('商品コード（4桁）が見つかりませんでした。テーブル部分を正しくコピーしてください。', 'error');
            return;
        }

        // 貼り付けUIを削除
        pasteUI.remove();

        // 商品データをセット
        currentProducts = products.map(p => ({
            code: p.code,
            name: '',
            quantity: p.quantity,
            unit: p.unit || '',
            unitPrice: 0,
            amount: 0
        }));

        // 商品マスタから単価・商品名を自動設定
        const priceType = detectedCustomer ? detectedCustomer.priceType : 2;
        currentProducts = applyPricesFromMaster(currentProducts, priceType);

        // 送料行を追加
        if (detectedCustomer && detectedCustomer.prefecture) {
            const shippingCode = shippingCodes[detectedCustomer.prefecture];
            if (shippingCode) {
                const shippingPriceExcludingTax = getWholesalePrice(shippingCode, priceType);
                const shippingPrice = toTaxIncluded(shippingPriceExcludingTax);
                const shippingName = getProductName(shippingCode) || '送料';
                currentProducts.push({
                    code: shippingCode,
                    name: shippingName,
                    quantity: 1,
                    unit: '',
                    unitPrice: shippingPrice,
                    amount: shippingPrice,
                    isShipping: true
                });
            }
        }

        // アップロードボックスに完了マーク
        const uploadBox = document.getElementById('yamazenUploadBox');
        if (uploadBox) uploadBox.classList.add('loaded');

        displayProductTable(currentProducts);
        document.getElementById('yamazenConvertSection').style.display = 'block';

        const productCount = currentProducts.filter(p => !p.isShipping).length;
        showStatus(`✅ ${productCount}件の商品を読み取りました（FAX: ${pdfData.companyName}、テキスト貼付）`, 'success');
    });
}

/**
 * 商品テーブルを表示
 * @param {Array<Object>} products
 */
function displayProductTable(products) {
    const container = document.getElementById('yamazenProductTable');
    if (!container) return;

    const table = document.createElement('table');
    table.className = 'product-table';

    // ヘッダー
    table.innerHTML = `
        <thead>
            <tr>
                <th style="width: 80px;">商品コード</th>
                <th>商品名</th>
                <th style="width: 80px; text-align: center;">数量</th>
                <th style="width: 120px; text-align: right;">単価</th>
                <th style="width: 120px; text-align: right;">金額</th>
                <th style="width: 40px;"></th>
            </tr>
        </thead>
        <tbody></tbody>
        <tfoot>
            <tr class="total-row">
                <td colspan="5" style="text-align: right;">合計</td>
                <td id="yamazenTotalAmount" style="text-align: right;">¥0</td>
            </tr>
        </tfoot>
    `;

    const tbody = table.querySelector('tbody');

    products.forEach((product, index) => {
        const tr = document.createElement('tr');
        const isShipping = product.isShipping;
        const rowStyle = isShipping ? 'background: #fff3e0;' : '';
        const codeDisplay = isShipping ? `📦 ${product.code}` : product.code;

        // 数量欄：全行を編集可能に
        const quantityCell = `<input type="number"
                      id="quantity_${index}"
                      value="${product.quantity}"
                      min="1"
                      style="width: 60px; text-align: center; padding: 5px;"
                      data-index="${index}">`;

        tr.innerHTML = `
            <td style="font-family: monospace; ${rowStyle}">${codeDisplay}</td>
            <td style="${rowStyle}">${product.name}</td>
            <td style="text-align: center; ${rowStyle}">${quantityCell}</td>
            <td style="${rowStyle}">
                <input type="number"
                       id="unitPrice_${index}"
                       value="${product.unitPrice || ''}"
                       placeholder="単価"
                       min="0"
                       data-index="${index}"
                       ${isShipping ? 'readonly style="background: #f5f5f5;"' : ''}>
            </td>
            <td id="amount_${index}" style="text-align: right; font-weight: 600; ${rowStyle}">
                ${product.amount > 0 ? '¥' + product.amount.toLocaleString() : '-'}
            </td>
            <td style="text-align: center; ${rowStyle}">
                <button class="delete-row-btn" data-index="${index}" title="削除"
                        style="background: none; border: none; cursor: pointer; font-size: 16px; color: #e53935; padding: 2px 6px;">✕</button>
            </td>
        `;
        tbody.appendChild(tr);

        // 単価入力時のイベント
        const unitPriceInput = tr.querySelector(`#unitPrice_${index}`);
        unitPriceInput.addEventListener('input', () => handleUnitPriceChange(index));
        unitPriceInput.addEventListener('change', () => handleUnitPriceChange(index));

        // 数量入力時のイベント
        const quantityInput = tr.querySelector(`#quantity_${index}`);
        quantityInput.addEventListener('input', () => handleQuantityChange(index));
        quantityInput.addEventListener('change', () => handleQuantityChange(index));

        // 削除ボタン
        tr.querySelector('.delete-row-btn').addEventListener('click', () => {
            currentProducts.splice(index, 1);
            displayProductTable(currentProducts);
        });
    });

    container.innerHTML = '';
    container.appendChild(table);

    updateLotWarnings();
    updateTotal();
}

/**
 * ロット数未満の警告メッセージを更新
 */
function updateLotWarnings() {
    const container = document.getElementById('yamazenProductTable');
    if (!container) return;

    // 既存の警告を削除
    const existing = container.querySelector('.lot-warning');
    if (existing) existing.remove();

    const messages = [];

    // 顧客未検出の警告
    if (!detectedCustomer) {
        messages.push(`<span style="color: #d32f2f;">⚠ 顧客を検出できませんでした。得意先コード・納入コード等を手動で設定してください。</span>`);
    }

    // 未登録取引先の警告
    if (detectedCustomer) {
        const registeredCodes = Object.values(VENDORS).map(v => v.code);
        if (!registeredCodes.includes(detectedCustomer.code)) {
            messages.push(`<span style="color: #d32f2f;">⚠ ${detectedCustomer.name}（${detectedCustomer.code}）はレジストリ未登録の取引先です。納入コード・変換設定が未調整のため、出力内容を確認してください。</span>`);
        }
    }

    // ロット数未満の警告
    currentProducts
        .filter(p => p.lotSize && p.quantity < p.lotSize && !p.isShipping)
        .forEach(p => {
            messages.push(`⚠ ${p.code} ${p.name}: 注文数${p.quantity} < 卸単位${p.lotSize} → ばら売り単価への変更が必要`);
        });

    // メール本文参照（商品0件または顧客未検出時）
    const productCount = currentProducts.filter(p => !p.isShipping).length;
    if (currentEmailBody && (productCount === 0 || !detectedCustomer)) {
        const escaped = currentEmailBody.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        messages.push(`<details style="margin-top: 5px;"><summary style="cursor: pointer;">📧 メール本文を表示</summary><div style="margin-top: 8px; padding: 10px; background: #fff; border: 1px solid #ddd; border-radius: 4px; white-space: pre-wrap; font-size: 12px;">${escaped}</div></details>`);
    }

    if (messages.length > 0) {
        const div = document.createElement('div');
        div.className = 'lot-warning';
        div.style.cssText = 'margin-top: 10px; padding: 10px 15px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; color: #856404; font-size: 13px; line-height: 1.8;';
        div.innerHTML = messages.join('<br>');
        container.appendChild(div);
    }
}

/**
 * 単価変更時の処理
 * @param {number} index
 */
function handleUnitPriceChange(index) {
    const input = document.getElementById(`unitPrice_${index}`);
    const amountCell = document.getElementById(`amount_${index}`);

    if (!input || !amountCell || !currentProducts[index]) return;

    const unitPrice = parseInt(input.value, 10) || 0;
    currentProducts[index].unitPrice = unitPrice;
    currentProducts[index].amount = calculateAmount(currentProducts[index]);

    const amount = currentProducts[index].amount;
    amountCell.textContent = amount > 0 ? '¥' + amount.toLocaleString() : '-';

    updateTotal();
}

/**
 * 数量変更時の処理（送料用）
 * @param {number} index
 */
function handleQuantityChange(index) {
    const input = document.getElementById(`quantity_${index}`);
    const amountCell = document.getElementById(`amount_${index}`);

    if (!input || !amountCell || !currentProducts[index]) return;

    const quantity = parseInt(input.value, 10) || 1;
    currentProducts[index].quantity = quantity;
    currentProducts[index].amount = calculateAmount(currentProducts[index]);

    const amount = currentProducts[index].amount;
    amountCell.textContent = amount > 0 ? '¥' + amount.toLocaleString() : '-';

    updateLotWarnings();
    updateTotal();
}

/**
 * 合計金額を更新
 */
function updateTotal() {
    const totalElement = document.getElementById('yamazenTotalAmount');
    if (!totalElement) return;

    const total = calculateTotal(currentProducts);
    totalElement.textContent = '¥' + total.toLocaleString();
}

/**
 * クリア処理（プレビューのみクリア、確認済み注文リストは維持）
 */
function handleClear() {
    currentProducts = [];
    emailDate = null;
    detectedCustomer = null;
    currentEmlFileName = '';

    // ファイル名をクリア
    const fileNameElement = document.getElementById('yamazenFileName');
    if (fileNameElement) fileNameElement.textContent = '';

    // アップロードボックスの状態をリセット
    const uploadBox = document.getElementById('yamazenUploadBox');
    if (uploadBox) uploadBox.classList.remove('loaded');

    // ファイル入力をリセット
    const fileInput = document.getElementById('yamazenEmlInput');
    if (fileInput) fileInput.value = '';

    // 検出された顧客情報をクリア
    const customerInfoElement = document.getElementById('detectedCustomerInfo');
    if (customerInfoElement) customerInfoElement.style.display = 'none';

    // セクションを非表示
    document.getElementById('yamazenProductSection').style.display = 'none';
    document.getElementById('yamazenConvertSection').style.display = 'none';

    // 日付をリセット
    setDefaultDate();

    // 担当者コードをリセット
    const tantoshaInput = document.getElementById('yamazenTantousha');
    if (tantoshaInput) tantoshaInput.value = '0';

    showStatus('', '');
}

/**
 * 注文を確認して確認済みリストに追加
 */
function handleConfirmOrder() {
    // 顧客チェック
    if (!detectedCustomer) {
        showStatus('⚠️ 顧客が検出されていません。顧客マスタを確認してください。', 'error');
        return;
    }

    // 単価入力チェック（送料行は除外）
    const missingPrices = currentProducts.filter(p => !p.isShipping && (!p.unitPrice || p.unitPrice <= 0));
    if (missingPrices.length > 0) {
        showStatus('⚠️ すべての商品に単価を入力してください', 'error');
        return;
    }

    // 設定を取得
    const orderDate = document.getElementById('yamazenOrderDate')?.value;
    const tantoshaCode = document.getElementById('yamazenTantousha')?.value || '0';

    // 合計金額を計算
    const total = calculateTotal(currentProducts);

    // 商品件数（送料除く）
    const productCount = currentProducts.filter(p => !p.isShipping).length;

    // 確認済み注文を作成
    const order = {
        id: 'order_' + Date.now(),
        customer: { ...detectedCustomer },
        products: currentProducts.map(p => ({ ...p })),  // 深いコピー
        orderDate: orderDate,
        tantoshaCode: tantoshaCode,
        emlFileName: currentEmlFileName,
        total: total,
        productCount: productCount,
        selected: true  // デフォルトで選択状態
    };

    // 確認済みリストに追加
    confirmedOrders.push(order);
    console.log('注文を追加しました:', order);

    // 注文リストを表示
    displayOrderList();

    // 注文リストセクションを表示
    document.getElementById('yamazenOrderListSection').style.display = 'block';

    // 顧客名を保存（resetPreviewでnullになる前に）
    const customerName = detectedCustomer.name;

    // プレビューをクリア（次の入力待機）
    resetPreview();

    showStatus(`✅ ${customerName} の注文を追加しました（計${confirmedOrders.length}件）`, 'success');
}

/**
 * プレビューをリセット（次の入力待機状態に）
 */
function resetPreview() {
    currentProducts = [];
    emailDate = null;
    detectedCustomer = null;
    currentEmlFileName = '';

    // ファイル名をクリア
    const fileNameElement = document.getElementById('yamazenFileName');
    if (fileNameElement) fileNameElement.textContent = '';

    // アップロードボックスの状態をリセット
    const uploadBox = document.getElementById('yamazenUploadBox');
    if (uploadBox) uploadBox.classList.remove('loaded');

    // ファイル入力をリセット
    const fileInput = document.getElementById('yamazenEmlInput');
    if (fileInput) fileInput.value = '';

    // 検出された顧客情報をクリア
    const customerInfoElement = document.getElementById('detectedCustomerInfo');
    if (customerInfoElement) customerInfoElement.style.display = 'none';

    // プレビューセクションを非表示
    document.getElementById('yamazenProductSection').style.display = 'none';
    document.getElementById('yamazenConvertSection').style.display = 'none';

    // 日付をリセット
    setDefaultDate();

    // 担当者コードをリセット
    const tantoshaInput = document.getElementById('yamazenTantousha');
    if (tantoshaInput) tantoshaInput.value = '0';
}

/**
 * 確認済み注文リストを表示
 */
function displayOrderList() {
    const container = document.getElementById('yamazenOrderList');
    if (!container) return;

    if (confirmedOrders.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666;">確認済み注文はありません</p>';
        document.getElementById('yamazenOrderListSection').style.display = 'none';
        return;
    }

    // テーブル作成
    let html = `
        <table class="order-list-table">
            <thead>
                <tr>
                    <th style="width: 50px; text-align: center;">選択</th>
                    <th>顧客名</th>
                    <th style="width: 100px;">商品数</th>
                    <th style="width: 120px; text-align: right;">合計金額</th>
                    <th style="width: 100px;">受注日</th>
                    <th style="width: 80px;">操作</th>
                </tr>
            </thead>
            <tbody>
    `;

    confirmedOrders.forEach((order, index) => {
        const rowClass = order.selected ? 'selected' : '';
        const dateStr = order.orderDate || '';

        html += `
            <tr class="${rowClass}">
                <td style="text-align: center;">
                    <input type="checkbox"
                           ${order.selected ? 'checked' : ''}
                           onchange="window.toggleOrderSelection(${index})">
                </td>
                <td>
                    <strong>${order.customer.name}</strong>
                    <br><small style="color: #666;">${order.emlFileName}</small>
                </td>
                <td>商品${order.productCount}件＋送料</td>
                <td style="text-align: right; font-weight: 600;">¥${order.total.toLocaleString()}</td>
                <td>${dateStr}</td>
                <td>
                    <button class="delete-btn" onclick="window.removeOrder(${index})">削除</button>
                </td>
            </tr>
        `;
    });

    html += '</tbody></table>';

    // 選択中の件数を表示
    const selectedCount = confirmedOrders.filter(o => o.selected).length;
    html += `<p style="margin-top: 10px; color: #666; font-size: 14px;">
        選択中: <strong>${selectedCount}</strong> / ${confirmedOrders.length} 件
    </p>`;

    container.innerHTML = html;
}

/**
 * 注文の選択状態を切り替え
 * @param {number} index
 */
function toggleOrderSelection(index) {
    if (confirmedOrders[index]) {
        confirmedOrders[index].selected = !confirmedOrders[index].selected;
        displayOrderList();
    }
}

/**
 * 全注文を選択
 */
function selectAllOrders() {
    confirmedOrders.forEach(order => order.selected = true);
    displayOrderList();
}

/**
 * 全注文の選択を解除
 */
function deselectAllOrders() {
    confirmedOrders.forEach(order => order.selected = false);
    displayOrderList();
}

/**
 * 注文を削除
 * @param {number} index
 */
function removeOrder(index) {
    if (confirmedOrders[index]) {
        const orderName = confirmedOrders[index].customer.name;
        confirmedOrders.splice(index, 1);
        displayOrderList();
        showStatus(`${orderName} の注文を削除しました`, 'info');
    }
}

/**
 * 選択中の注文を削除
 */
function removeSelectedOrders() {
    const selectedCount = confirmedOrders.filter(o => o.selected).length;
    if (selectedCount === 0) {
        showStatus('⚠️ 削除する注文を選択してください', 'error');
        return;
    }

    if (!confirm(`選択中の ${selectedCount} 件の注文を削除しますか？`)) {
        return;
    }

    confirmedOrders = confirmedOrders.filter(o => !o.selected);
    displayOrderList();
    showStatus(`${selectedCount} 件の注文を削除しました`, 'info');
}

/**
 * 一括変換処理
 */
function handleBatchConvert() {
    // 選択された注文を取得
    const selectedOrders = confirmedOrders.filter(o => o.selected);

    if (selectedOrders.length === 0) {
        showStatus('⚠️ 変換する注文を選択してください', 'error');
        return;
    }

    // 伝票番号チェック
    const startDenpyoNo = document.getElementById('yamazenDenpyoNo')?.value.trim();
    if (!startDenpyoNo) {
        showStatus('⚠️ 伝票番号（開始番号）を入力してください', 'error');
        return;
    }

    // 開始番号を数値に変換
    const startNo = parseInt(startDenpyoNo, 10);
    if (isNaN(startNo)) {
        showStatus('⚠️ 伝票番号は数値で入力してください', 'error');
        return;
    }

    try {
        // 全注文を変換してTXTを生成
        const allLines = [];
        let currentDenpyoNo = startNo;

        selectedOrders.forEach((order, index) => {
            // 伝票番号を連番で割り当て
            const denpyoNo = String(currentDenpyoNo).padStart(4, '0');

            // 納入先コードを決定
            const nounyuCode = determineNounyuCode(order.customer);

            // 弥生形式に変換
            const txtContent = convertToYayoiFormat(order.products, {
                denpyoNo: denpyoNo,
                orderDate: order.orderDate,
                tantoshaCode: order.tantoshaCode,
                tokuisakiCode: order.customer.code,
                customerName: order.customer.name,
                shippingCode: null,  // 送料は既にproductsに含まれている
                torihikiKubun: order.customer.torihikiKubun || 2,  // 取引区分
                nounyuCode: nounyuCode  // 納入先コード
            });

            allLines.push(txtContent);
            console.log(`注文${index + 1}: ${order.customer.name} → 伝票番号 ${denpyoNo}, 取引区分=${order.customer.torihikiKubun}, 納入先=${nounyuCode}`);

            currentDenpyoNo++;
        });

        // 全行を結合（改行コードで結合）
        const combinedContent = allLines.join('\r\n');

        // ダウンロード
        const filename = `wholesale_batch_${getDateString()}.txt`;
        downloadAsShiftJIS(combinedContent, filename);

        // 次回の開始番号を表示
        const nextDenpyoNo = String(currentDenpyoNo).padStart(4, '0');

        showStatus(`✅ ${selectedOrders.length}件の注文をTXT出力しました（伝票番号: ${startDenpyoNo}〜${String(currentDenpyoNo - 1).padStart(4, '0')}、次回: ${nextDenpyoNo}）`, 'success');

        // 変換済みの注文を削除するか確認
        if (confirm(`変換済みの ${selectedOrders.length} 件の注文をリストから削除しますか？`)) {
            confirmedOrders = confirmedOrders.filter(o => !o.selected);
            displayOrderList();
        }

    } catch (error) {
        showStatus(`❌ 変換エラー: ${error.message}`, 'error');
        console.error('一括変換エラー:', error);
    }
}

// グローバル関数として公開（HTMLのonclickから呼び出すため）
window.toggleOrderSelection = toggleOrderSelection;
window.removeOrder = removeOrder;

/**
 * ステータスメッセージを表示
 * @param {string} message
 * @param {string} type - 'success', 'error', 'info', ''
 */
function showStatus(message, type) {
    const statusElement = document.getElementById('wholesaleStatus');
    if (!statusElement) return;

    if (!message) {
        statusElement.style.display = 'none';
        return;
    }

    statusElement.textContent = message;
    statusElement.className = 'wholesale-status';
    if (type) {
        statusElement.classList.add(type);
    }
    statusElement.style.display = 'block';
}

/**
 * 商品マスタの状態を確認・表示
 */
function checkProductMaster() {
    const info = getProductMasterInfo();
    const infoElement = document.getElementById('productMasterInfo');
    const uploadBox = document.getElementById('productMasterUploadBox');

    if (info && infoElement) {
        const date = new Date(info.updatedAt);
        const dateStr = `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()}`;
        infoElement.innerHTML = `
            <div style="color: #28a745; font-weight: 600;">✅ 商品マスタ読み込み済み</div>
            <div>商品数: ${info.count}件</div>
            <div>更新日: ${dateStr}</div>
        `;
        infoElement.style.display = 'block';
        if (uploadBox) uploadBox.classList.add('loaded');
    }
}

/**
 * 商品マスタファイルを処理
 * @param {File} file
 */
async function handleProductMasterFile(file) {
    console.log('商品マスタファイル処理開始:', file.name);
    showStatus('商品マスタを読み込み中...', 'info');

    try {
        const result = await loadProductMasterFile(file);
        console.log('商品マスタ読み込み成功:', result);
        showStatus(`✅ ${result.message}`, 'success');
        checkProductMaster();
    } catch (error) {
        showStatus(`❌ エラー: ${error.message}`, 'error');
        console.error('商品マスタ読み込みエラー:', error);
    }
}

/**
 * 商品マスタをクリア
 */
function handleClearProductMaster() {
    if (!confirm('商品マスタをクリアしますか？')) return;

    clearProductMaster();

    const infoElement = document.getElementById('productMasterInfo');
    if (infoElement) {
        infoElement.style.display = 'none';
    }

    const uploadBox = document.getElementById('productMasterUploadBox');
    if (uploadBox) uploadBox.classList.remove('loaded');

    const fileInput = document.getElementById('productMasterInput');
    if (fileInput) fileInput.value = '';

    showStatus('✅ 商品マスタをクリアしました', 'success');
}

// 消費税率
const TAX_RATE = 0.10;
const REDUCED_TAX_RATE = 0.08;  // 軽減税率（食料品等）
const REDUCED_TAX_CATEGORY1 = '07';  // 分類１が07（食料品）は軽減税率

/**
 * 税別価格を税込価格に変換（四捨五入）
 * @param {number} price - 税別価格
 * @param {boolean} isReducedTax - 軽減税率対象かどうか
 * @returns {number} 税込価格
 */
function toTaxIncluded(price, isReducedTax = false) {
    const rate = isReducedTax ? REDUCED_TAX_RATE : TAX_RATE;
    return Math.round(price * (1 + rate));
}

/**
 * 商品データに単価と商品名を自動設定
 * @param {Array<Object>} products
 * @param {number} priceType - 単価種類（1, 2, or 3）
 * @returns {Array<Object>} 単価・商品名設定済みの商品データ
 */
function applyPricesFromMaster(products, priceType = 2) {
    const master = loadProductMaster();
    if (!master) {
        console.warn('商品マスタが読み込まれていません');
        return products;
    }

    console.log('商品マスタから単価・商品名を適用中... マスタ件数:', master.size, '単価種類:', priceType);

    let priceFoundCount = 0;
    let nameFoundCount = 0;

    products.forEach(product => {
        const code = product.code;

        // 分類１から軽減税率対象か判定
        const category1 = getProductCategory1(code);
        const isReducedTax = (category1 === REDUCED_TAX_CATEGORY1);

        // 商品マスタから単価を取得（税別）→ 税込に変換
        const priceExcludingTax = getWholesalePrice(code, priceType);
        if (priceExcludingTax > 0) {
            const priceIncludingTax = toTaxIncluded(priceExcludingTax, isReducedTax);
            product.unitPrice = priceIncludingTax;
            product.isReducedTax = isReducedTax;
            product.amount = calculateAmount(product);
            console.log(`単価設定: ${code} 税別${priceExcludingTax} → 税込${priceIncludingTax}${isReducedTax ? ' (軽減税率8%)' : ''}`);
            priceFoundCount++;
        }

        // 商品マスタから商品名を取得（マスタの名称を正解とする）
        const masterName = getProductName(code);
        if (masterName) {
            console.log(`商品名置換: ${code} "${product.name}" → "${masterName}"`);
            product.name = masterName;
            nameFoundCount++;
        } else {
            console.warn(`商品名が見つかりません: コード="${code}"`);
        }
    });

    console.log(`適用結果: 単価=${priceFoundCount}件, 商品名=${nameFoundCount}件 / 全${products.length}件`);

    return products;
}

/**
 * 顧客マスタの状態を確認・表示
 */
function checkCustomerMaster() {
    const info = getCustomerMasterInfo();
    const infoElement = document.getElementById('customerMasterInfo');
    const uploadBox = document.getElementById('customerMasterUploadBox');

    if (info && infoElement) {
        const date = new Date(info.updatedAt);
        const dateStr = `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()}`;
        infoElement.innerHTML = `
            <div style="color: #1976d2; font-weight: 600;">✅ 顧客マスタ読み込み済み</div>
            <div>顧客数: ${info.count}件</div>
            <div>更新日: ${dateStr}</div>
        `;
        infoElement.style.display = 'block';
        if (uploadBox) uploadBox.classList.add('loaded');
    }
}

/**
 * 顧客マスタファイルを処理
 * @param {File} file
 */
async function handleCustomerMasterFile(file) {
    console.log('顧客マスタファイル処理開始:', file.name);
    showStatus('顧客マスタを読み込み中...', 'info');

    try {
        const result = await loadCustomerMasterFile(file);
        console.log('顧客マスタ読み込み成功:', result);
        showStatus(`✅ ${result.message}`, 'success');
        checkCustomerMaster();
    } catch (error) {
        showStatus(`❌ エラー: ${error.message}`, 'error');
        console.error('顧客マスタ読み込みエラー:', error);
    }
}

/**
 * 顧客マスタをクリア
 */
function handleClearCustomerMaster() {
    if (!confirm('顧客マスタをクリアしますか？')) return;

    clearCustomerMaster();

    const infoElement = document.getElementById('customerMasterInfo');
    if (infoElement) infoElement.style.display = 'none';

    const uploadBox = document.getElementById('customerMasterUploadBox');
    if (uploadBox) uploadBox.classList.remove('loaded');

    const fileInput = document.getElementById('customerMasterInput');
    if (fileInput) fileInput.value = '';

    showStatus('✅ 顧客マスタをクリアしました', 'success');
}

/**
 * EMLの添付PDFを処理
 * @param {File} emlFile - 元のEMLファイル
 * @param {Object} emlData - EML解析結果
 * @param {Object} pdfAttachment - PDF添付ファイル {filename, contentType, data: ArrayBuffer}
 */
async function handleEmlWithPdfAttachment(emlFile, emlData, pdfAttachment) {
    showStatus('PDF添付ファイルを解析中...', 'info');

    try {
        // PDF.jsが読み込まれているか確認
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js が読み込まれていません');
        }

        // ArrayBufferからPDFを解析
        const pdf = await pdfjsLib.getDocument({ data: pdfAttachment.data }).promise;
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

        // PDFパーサーのロジックを使用して商品を抽出
        const normalizedText = fullText.replace(/\s+/g, ' ');
        const pdfProducts = parseOrderTable(normalizedText);

        if (pdfProducts.length === 0) {
            showStatus('PDFから商品データが見つかりませんでした。', 'error');
            return;
        }

        // ファイル名を保存・表示（EMLファイル名 + PDF添付名）
        currentEmlFileName = `${emlFile.name} (添付: ${pdfAttachment.filename})`;
        displayFileName(currentEmlFileName);

        // 顧客を検出（EMLのメタデータから）
        detectedCustomer = detectCustomerFromEml(emlData);
        if (detectedCustomer) {
            console.log('顧客検出成功:', detectedCustomer);
            displayDetectedCustomer(detectedCustomer);
        } else {
            // 卸販売では顧客特定が必須 - エラーで中断
            console.error('顧客を検出できませんでした - 処理中断');
            showStatus('❌ 顧客を特定できませんでした。顧客マスタにドメイン/会社名が登録されているか確認してください。', 'error');
            return;  // 処理を中断
        }

        // 日付を設定（EMLのDateヘッダーから）
        if (emlData.date) {
            emailDate = emlData.date;
            const dateInput = document.getElementById('yamazenOrderDate');
            if (dateInput && emlData.date.length === 8) {
                const formatted = `${emlData.date.slice(0,4)}-${emlData.date.slice(4,6)}-${emlData.date.slice(6,8)}`;
                dateInput.value = formatted;
            }
        }

        // 商品データを設定
        currentProducts = pdfProducts.map(p => ({
            code: p.code,
            name: '',  // 商品マスタから取得
            quantity: p.quantity,
            unit: p.unit || '',
            unitPrice: 0,
            amount: 0
        }));

        // 商品マスタから単価・商品名を自動設定（顧客の単価種類に応じて）
        const priceType = detectedCustomer ? detectedCustomer.priceType : 2;
        currentProducts = applyPricesFromMaster(currentProducts, priceType);

        // 送料行を追加（顧客の都道府県から）
        if (detectedCustomer && detectedCustomer.prefecture) {
            const shippingCode = shippingCodes[detectedCustomer.prefecture];
            if (shippingCode) {
                const shippingPriceExcludingTax = getWholesalePrice(shippingCode, priceType);
                const shippingPrice = toTaxIncluded(shippingPriceExcludingTax);
                const shippingName = getProductName(shippingCode) || '送料';
                currentProducts.push({
                    code: shippingCode,
                    name: shippingName,
                    quantity: 1,
                    unit: '',
                    unitPrice: shippingPrice,
                    amount: shippingPrice,
                    isShipping: true
                });
                console.log('送料行追加:', shippingCode, shippingName, `税別${shippingPriceExcludingTax} → 税込${shippingPrice}`);
            }
        }

        // アップロードボックスに完了マーク
        const uploadBox = document.getElementById('yamazenUploadBox');
        if (uploadBox) uploadBox.classList.add('loaded');

        // 商品テーブルを表示
        displayProductTable(currentProducts);

        // 変換セクションを表示
        document.getElementById('yamazenProductSection').style.display = 'block';
        document.getElementById('yamazenConvertSection').style.display = 'block';

        // 担当者コードを自動設定
        if (detectedCustomer && detectedCustomer.tantosha) {
            const tantoshaInput = document.getElementById('yamazenTantousha');
            if (tantoshaInput) tantoshaInput.value = detectedCustomer.tantosha;
        }

        // 商品件数から送料を除外
        const productCount = currentProducts.filter(p => !p.isShipping).length;
        const statusMsg = detectedCustomer
            ? `✅ PDF添付から${productCount}件の商品を抽出しました（${detectedCustomer.name}、送料込み）`
            : `✅ PDF添付から${productCount}件の商品を抽出しました`;
        showStatus(statusMsg, 'success');

    } catch (error) {
        showStatus(`❌ PDF添付解析エラー: ${error.message}`, 'error');
        console.error('PDF添付処理エラー:', error);
    }
}

