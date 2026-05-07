/**
 * main.js - メインロジックとイベントハンドラ
 * ver 3.2 - UI改善版
 */

import { checkStoredData, saveToLocalStorage, loadFromLocalStorage, clearLocalStorage, exportToJSON, importFromJSON } from '../common/storage.js';
import { parseColorMeCSV, parseYayoiCSV, convertExcelToCSV } from './parser.js';
import { performCustomerMatching } from './matcher.js';
import { convertToYayoi, downloadAsShiftJIS } from './converter.js';
import { showStatus, displaySummary, displayNewCustomers, displayOrders, toggleHelpModal, toggleAdvancedSettings, displayFileName, setButtonEnabled, getDateString } from './ui.js';
import { getProductCategory1 } from '../common/product-master.js';
import { toHalfWidthKatakana } from '../common/kana-utils.js';
import { loadCustomerMaster, loadCustomerMasterFile } from '../common/customer-master.js';
import { parseYuchoBankCSV, decodeShiftJIS } from './bank-parser.js';
import { matchDepositsToOrders } from './bank-matcher.js';

// グローバル変数
let colormeOrders = [];
let yayoiCustomers = [];
let newCustomersList = [];
let displayedOrders = [];
let currentSortOrder = 'desc';
let currentBankMatches = null; // ゆうちょ入金照合結果
let currentDenpyoNoMap = null; // 予定売上伝票No表示用
let currentShowDeliveryTime = false; // 配送希望時間表示フラグ

// ページ読み込み時の初期化
window.addEventListener('DOMContentLoaded', () => {
    checkStoredData();
    setupEventListeners();
    loadCustomersFromCommonMaster();
});

/**
 * 共通マスタから顧客データを読み込み（小売用に変換）
 */
function loadCustomersFromCommonMaster() {
    const commonMaster = loadCustomerMaster();
    if (!commonMaster || commonMaster.size === 0) return;

    // 共通マスタ（Map）を小売用の配列形式に変換
    const customers = [];
    for (const [code, customer] of commonMaster) {
        customers.push({
            customerCode: customer.code,
            name: customer.name,
            furigana: customer.furigana || '',
            phone: customer.phone || '',
            email: customer.email || '',
            address1: customer.address1 || '',
            prefecture: customer.prefecture || ''
        });
    }

    if (customers.length > 0) {
        yayoiCustomers = customers;
        displayFileName('yayoiName', `共通マスタ（${customers.length}件）`, '#1976d2');
        console.log(`共通マスタから顧客データを読み込み: ${customers.length}件`);

        // ボックスに読み込み完了クラスを追加
        const box = document.getElementById('yayoiUploadBox');
        if (box) box.classList.add('loaded');

        checkBothFilesLoaded();
    }
}

/**
 * 小売タブのファイルアップロードを共通マスタにも同期保存
 */
async function syncToCommonMaster(file) {
    try {
        await loadCustomerMasterFile(file);
        window.dispatchEvent(new CustomEvent('customerMasterUpdated'));
        console.log('共通マスタに同期保存しました');
    } catch (error) {
        console.warn('共通マスタへの同期保存に失敗（小売用データは正常）:', error.message);
    }
}

/**
 * イベントリスナーをセットアップ
 */
function setupEventListeners() {
    // ファイルアップロード
    setupFileUpload('colormeInput', 'colormeUploadBox', handleColorMeFile);
    setupFileUpload('yayoiInput', 'yayoiUploadBox', handleYayoiFile);
    
    // 保存データ使用
    document.getElementById('useStoredDataBtn')?.addEventListener('click', handleUseStoredData);
    
    // LocalStorage操作
    document.getElementById('exportStorageBtn')?.addEventListener('click', handleExportStorage);
    document.getElementById('importStorageBtn')?.addEventListener('click', () => {
        document.getElementById('importStorageFileInput')?.click();
    });
    document.getElementById('importStorageFileInput')?.addEventListener('change', handleImportStorage);
    document.getElementById('clearStorageBtn')?.addEventListener('click', handleClearStorage);
    
    // 折りたたみメニュー
    document.getElementById('advancedSettingsToggle')?.addEventListener('click', toggleAdvancedSettings);
    
    // 顧客照合
    document.getElementById('matchBtn')?.addEventListener('click', handleCustomerMatching);
    
    // ヘルプボタン
    document.getElementById('colormeHelpBtn')?.addEventListener('click', () => toggleHelpModal(true));
    document.getElementById('helpModalClose')?.addEventListener('click', () => toggleHelpModal(false));
    document.getElementById('helpModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'helpModal') toggleHelpModal(false);
    });
    
    // 新規顧客関連
    document.getElementById('exportNewCustomersBtn')?.addEventListener('click', handleExportNewCustomers);
    document.getElementById('registrationCompleteBtn')?.addEventListener('click', handleRegistrationComplete);
    document.getElementById('updateCustomerListBtn')?.addEventListener('click', handleUpdateCustomerList);
    
    // 変換ボタン
    document.getElementById('convertBtn')?.addEventListener('click', handleConvert);

    // ゆうちょ入金CSV読込
    document.getElementById('bankCSVFile')?.addEventListener('change', handleBankCSVFile);
}

/**
 * ファイルアップロードのセットアップ
 */
function setupFileUpload(inputId, boxId, handler) {
    const input = document.getElementById(inputId);
    const box = document.getElementById(boxId);
    
    if (!input || !box) return;
    
    // クリックでファイル選択
    box.addEventListener('click', (e) => {
        if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'LABEL') {
            input.click();
        }
    });
    
    // ファイル選択時
    input.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handler(file);
    });
    
    // ドラッグ&ドロップ
    box.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        box.classList.add('dragover');
    });

    box.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        box.classList.add('dragover');
    });

    box.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // ボックスの外に出た時のみdragoverクラスを削除
        if (e.target === box) {
            box.classList.remove('dragover');
        }
    });

    box.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        box.classList.remove('dragover');

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file) handler(file);
        }
    });
}

/**
 * カラーミーCSVファイルを処理
 */
function handleColorMeFile(file) {
    if (!file.name.endsWith('.csv')) {
        showStatus('CSVファイルを選択してください', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            colormeOrders = parseColorMeCSV(e.target.result);
            displayFileName('colormeName', file.name);
            showStatus(`✅ カラーミーCSV読み込み完了（${colormeOrders.length}件）`, 'success');

            // ボックスに読み込み完了クラスを追加
            const box = document.getElementById('colormeUploadBox');
            if (box) box.classList.add('loaded');

            checkBothFilesLoaded();
        } catch (error) {
            showStatus(`❌ エラー: ${error.message}`, 'error');
        }
    };
    reader.readAsText(file, 'Shift_JIS');
}

/**
 * 弥生販売CSV/Excelファイルを処理（ファイル形式判定）
 */
function handleYayoiFile(file) {
    const fileName = file.name.toLowerCase();
    const isCSV = fileName.endsWith('.csv');
    const isExcel = fileName.endsWith('.xlsx');

    if (!isCSV && !isExcel) {
        showStatus('CSVファイルまたはExcelファイル(.xlsx)を選択してください', 'error');
        return;
    }

    if (isExcel) {
        handleYayoiExcelFile(file);
    } else {
        handleYayoiCSVFile(file);
    }
}

/**
 * 弥生販売CSVファイルを処理
 */
function handleYayoiCSVFile(file) {
    console.log('\n' + '='.repeat(50));
    console.log('📄 CSVファイル読み込み開始');
    console.log('ファイル名:', file.name);
    console.log('='.repeat(50) + '\n');

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            yayoiCustomers = parseYayoiCSV(e.target.result);
            displayFileName('yayoiName', file.name);
            showStatus(`✅ 弥生販売CSV読み込み完了（${yayoiCustomers.length}件）`, 'success');

            // ボックスに読み込み完了クラスを追加
            const box = document.getElementById('yayoiUploadBox');
            if (box) box.classList.add('loaded');

            checkBothFilesLoaded();

            // 共通マスタにも同期保存
            syncToCommonMaster(file);
        } catch (error) {
            showStatus(`❌ エラー: ${error.message}`, 'error');
            console.error('CSV読み込みエラー:', error);
        }
    };
    reader.readAsText(file, 'UTF-8');
}

/**
 * 弥生販売Excelファイルを処理
 */
function handleYayoiExcelFile(file) {
    console.log('\n' + '='.repeat(50));
    console.log('📊 Excelファイル読み込み開始');
    console.log('ファイル名:', file.name);
    console.log('='.repeat(50) + '\n');

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const arrayBuffer = e.target.result;

            // ExcelをCSVに変換
            const csvText = convertExcelToCSV(arrayBuffer);

            // 既存のCSVパーサーで処理
            yayoiCustomers = parseYayoiCSV(csvText);

            displayFileName('yayoiName', file.name);
            showStatus(`✅ 弥生販売Excel読み込み完了（${yayoiCustomers.length}件）`, 'success');

            // ボックスに読み込み完了クラスを追加
            const box = document.getElementById('yayoiUploadBox');
            if (box) box.classList.add('loaded');

            checkBothFilesLoaded();

            // 共通マスタにも同期保存
            syncToCommonMaster(file);
        } catch (error) {
            showStatus(`❌ エラー: ${error.message}`, 'error');
            console.error('Excel読み込みエラー:', error);
        }
    };
    // Excelはバイナリファイルなので ArrayBuffer として読み込み
    reader.readAsArrayBuffer(file);
}

/**
 * 保存データを使用
 */
function handleUseStoredData() {
    const customers = loadFromLocalStorage();
    if (!customers) {
        showStatus('⚠️ 保存データが見つかりません', 'error');
        return;
    }

    yayoiCustomers = customers;
    displayFileName('yayoiName', `保存データ（${customers.length}件）`, '#4caf50');
    showStatus(`✅ 保存データ（${customers.length}件）を読み込みました`, 'success');

    // ボックスに読み込み完了クラスを追加
    const box = document.getElementById('yayoiUploadBox');
    if (box) box.classList.add('loaded');

    checkBothFilesLoaded();
}

/**
 * 両方のファイルが読み込まれたかチェック
 */
function checkBothFilesLoaded() {
    if (colormeOrders.length > 0 && yayoiCustomers.length > 0) {
        setButtonEnabled('matchBtn', true);
    }
}

/**
 * LocalStorageをJSONファイルに出力
 */
function handleExportStorage() {
    const result = exportToJSON();
    showStatus(result.success ? `✅ ${result.message}` : `❌ ${result.message}`, result.success ? 'success' : 'error');
}

/**
 * JSONファイルからLocalStorageに読み込み
 */
function handleImportStorage(e) {
    const file = e.target.files[0];
    if (!file) return;

    importFromJSON(file)
        .then(result => {
            yayoiCustomers = result.customers;
            displayFileName('yayoiName', `JSONデータ（${result.customers.length}件）`, '#4caf50');
            showStatus(`✅ ${result.message}`, 'success');

            // ボックスに読み込み完了クラスを追加
            const box = document.getElementById('yayoiUploadBox');
            if (box) box.classList.add('loaded');

            checkBothFilesLoaded();
        })
        .catch(error => {
            showStatus(`❌ ${error.message}`, 'error');
        });
}

/**
 * LocalStorageをクリア
 */
function handleClearStorage() {
    if (!confirm('ブラウザに保存されているデータを削除しますか？\n次回は最初からCSVファイルを読み込む必要があります。')) {
        return;
    }
    
    if (clearLocalStorage()) {
        showStatus('✅ ブラウザデータをクリアしました', 'success');
    } else {
        showStatus('❌ クリアに失敗しました', 'error');
    }
}

/**
 * 顧客照合を実行
 */
function handleCustomerMatching() {
    showStatus('顧客照合中...', 'info');

    const result = performCustomerMatching(colormeOrders, yayoiCustomers);
    newCustomersList = result.newCustomersList;

    // 警告がある場合の通知
    if (result.warnings && result.warnings.length > 0) {
        const warningDetails = result.warnings.map(w =>
            `${w.customerName}(${w.tokuisakiCode}): ${w.warnings.map(ww => ww.label).join(', ')}`
        ).join(' / ');
        console.log(`⚡ 顧客情報変更の可能性: ${result.warnings.length}件`);
        result.warnings.forEach(w => {
            w.warnings.forEach(ww => console.log(`  - ${w.customerName}: ${ww.detail}`));
        });
        showStatus(`⚡ ${result.warnings.length}件の顧客情報に変更の可能性があります（受注一覧の「要確認」を確認してください）`, 'info');
    }

    // サマリー表示
    displaySummary({
        totalOrders: colormeOrders.length,
        existingCount: result.existingCount,
        newCount: result.newCount,
        maxCode: result.maxCode,
        nextCode: result.nextCode
    });

    // 新規顧客リスト表示
    displayNewCustomers(newCustomersList);

    // 受注データリスト表示
    renderOrderList();

    // 新規顧客チェックボックスのイベント
    newCustomersList.forEach((customer, index) => {
        const checkbox = document.getElementById(`newCustomerCheck_${index}`);
        if (checkbox) {
            checkbox.addEventListener('change', () => handleNewCustomerCheckChange(index));
        }
    });

    // 新規顧客が0件の場合は、変換セクションをすぐに表示
    if (newCustomersList.length === 0) {
        document.getElementById('convertSection').style.display = 'block';
        document.getElementById('convertBtn').style.display = 'block';
    }

    showStatus('✅ 顧客照合が完了しました', 'success');

    // 照合結果サマリーへ自動スクロール（結果を視覚的に確認できるように）
    const summarySection = document.getElementById('summarySection');
    if (summarySection) {
        setTimeout(() => {
            summarySection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
}

/**
 * 全選択/全解除
 */
function handleSelectAll(e) {
    const checked = e.target.checked;
    colormeOrders.forEach((order, index) => {
        const checkbox = document.getElementById(`orderCheck_${index}`);
        if (checkbox) checkbox.checked = checked;
    });
}

/**
 * 受注チェックボックスの変更
 */
function handleOrderCheckChange(index) {
    // 現状は何もしない（将来的に個別の処理を追加可能）
}

/**
 * 受注リスト描画（ソートボタン・チェックボックスイベント含む）
 * チェック状態を保持したまま再描画できる
 */
function renderOrderList(preserveChecks) {
    // チェック状態の保存
    let checkedMap = null;
    if (preserveChecks) {
        checkedMap = new Map();
        colormeOrders.forEach((_, index) => {
            const cb = document.getElementById(`orderCheck_${index}`);
            if (cb) checkedMap.set(index, cb.checked);
        });
    }

    // チェック済みインデックスのSetを生成（配送希望はチェック済みのみ表示）
    const checkedSet = checkedMap
        ? new Set([...checkedMap.entries()].filter(([_, v]) => v).map(([k]) => k))
        : null;

    displayedOrders = displayOrders(colormeOrders, currentSortOrder, currentBankMatches, currentDenpyoNoMap, currentShowDeliveryTime, checkedSet);

    // チェック状態の復元
    if (checkedMap) {
        checkedMap.forEach((checked, index) => {
            const cb = document.getElementById(`orderCheck_${index}`);
            if (cb) cb.checked = checked;
        });
    }

    // イベントリスナー設定
    document.getElementById('selectAllOrders')?.addEventListener('change', handleSelectAll);
    colormeOrders.forEach((_, index) => {
        const cb = document.getElementById(`orderCheck_${index}`);
        if (cb) cb.addEventListener('change', () => handleOrderCheckChange(index));
    });

    // ソート切り替えボタン
    document.getElementById('sortDescBtn')?.addEventListener('click', () => {
        if (currentSortOrder !== 'desc') {
            currentSortOrder = 'desc';
            renderOrderList(true);
        }
    });
    document.getElementById('sortAscBtn')?.addEventListener('click', () => {
        if (currentSortOrder !== 'asc') {
            currentSortOrder = 'asc';
            renderOrderList(true);
        }
    });
    document.getElementById('sortBankBtn')?.addEventListener('click', () => {
        if (currentSortOrder !== 'bank') {
            currentSortOrder = 'bank';
            renderOrderList(true);
        }
    });

    // 予定売上伝票Noボタン
    document.getElementById('showDenpyoNoBtn')?.addEventListener('click', handleToggleDenpyoNo);

    // 配送希望表示ボタン
    document.getElementById('showDeliveryTimeBtn')?.addEventListener('click', () => {
        currentShowDeliveryTime = !currentShowDeliveryTime;
        renderOrderList(true);
    });

    // 候補バッジのクリックイベント
    document.querySelectorAll('.bank-candidate-clickable').forEach(el => {
        el.addEventListener('click', () => {
            const reasons = JSON.parse(el.dataset.reasons || '[]');
            const name = el.dataset.depositName;
            const amount = parseInt(el.dataset.depositAmount) || 0;
            const date = el.dataset.depositDate;
            showCandidateReasonPopup({ reasons, name, amount, date });
        });
    });
}

/**
 * ゆうちょ入金CSV読込ハンドラー
 */
async function handleBankCSVFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (colormeOrders.length === 0) {
        showStatus('⚠️ 先にカラーミーCSVを読み込んで顧客照合を行ってください', 'error');
        e.target.value = '';
        return;
    }

    try {
        const buffer = await file.arrayBuffer();
        const csvText = decodeShiftJIS(buffer);
        const deposits = parseYuchoBankCSV(csvText);

        if (deposits.length === 0) {
            showStatus('⚠️ 入金データが見つかりませんでした', 'error');
            e.target.value = '';
            return;
        }

        const result = matchDepositsToOrders(deposits, colormeOrders);
        currentBankMatches = result.matches;

        // 受注リストを再描画（入金照合列付き）
        renderOrderList(false);

        // サマリー表示（未照合入金ありの場合はリンク付き）
        const summaryEl = document.getElementById('bankMatchSummary');
        if (summaryEl) {
            const s = result.summary;
            let summaryHtml = `入金照合: ✅一致 <b>${s.confirmed}</b>件`;
            if (s.amountMismatch > 0) {
                summaryHtml += ` / ❗入金額誤り？ <b>${s.amountMismatch}</b>件`;
            }
            summaryHtml += ` / ⚠️候補 <b>${s.candidate}</b>件 / 未照合 <b>${s.unmatched}</b>件`;
            summaryHtml += `（入金${s.depositTotal}件中 照合${s.depositMatched}件`;
            if (s.depositUnmatched > 0) {
                summaryHtml += ` / <a href="#" id="showUnmatchedDeposits" style="color: #e65100;">未ペアリング${s.depositUnmatched}件</a>`;
            }
            summaryHtml += '）';
            summaryEl.innerHTML = summaryHtml;

            // 未ペアリング入金ポップアップ
            if (s.depositUnmatched > 0) {
                document.getElementById('showUnmatchedDeposits')?.addEventListener('click', (ev) => {
                    ev.preventDefault();
                    showUnmatchedDepositsPopup(result.unmatchedDeposits);
                });
            }
        }

        showStatus(`✅ ゆうちょ入金CSV読込完了（${deposits.length}件の入金データ）`, 'success');
    } catch (error) {
        showStatus(`❌ CSV読込エラー: ${error.message}`, 'error');
    }

    e.target.value = '';
}

/**
 * 候補理由のポップアップ表示
 */
function showCandidateReasonPopup({ reasons, name, amount, date }) {
    document.getElementById('bankPopupOverlay')?.remove();

    const reasonsList = reasons.map(r => `<li style="margin-bottom:4px;">${r}</li>`).join('');

    const overlay = document.createElement('div');
    overlay.id = 'bankPopupOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;';
    overlay.innerHTML = `
        <div style="background:white;border-radius:12px;padding:24px;max-width:450px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;color:#e65100;">⚠️ 候補の理由</h3>
                <button id="closeBankPopup" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666;">✕</button>
            </div>
            <div style="background:#fff3e0;border-radius:8px;padding:12px;margin-bottom:12px;">
                <div style="font-size:13px;color:#666;">振込情報</div>
                <div style="font-weight:bold;font-size:15px;margin-top:4px;">${name}</div>
                <div style="font-size:14px;margin-top:2px;">¥${amount.toLocaleString()} / ${date}</div>
            </div>
            <ul style="font-size:14px;color:#333;padding-left:20px;margin:0;">${reasonsList}</ul>
        </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('closeBankPopup').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

/**
 * 未ペアリング入金レコードのポップアップ表示
 */
function showUnmatchedDepositsPopup(unmatchedDeposits) {
    // 既存のポップアップがあれば削除
    document.getElementById('bankPopupOverlay')?.remove();

    let tableRows = unmatchedDeposits.map(d =>
        `<tr>
            <td style="padding: 8px 12px;">${d.date}</td>
            <td style="padding: 8px 12px; text-align: right; font-weight: bold;">¥${d.amount.toLocaleString()}</td>
            <td style="padding: 8px 12px;">${d.type}</td>
            <td style="padding: 8px 12px;">${d.name}</td>
        </tr>`
    ).join('');

    const totalAmount = unmatchedDeposits.reduce((sum, d) => sum + d.amount, 0);

    const overlay = document.createElement('div');
    overlay.id = 'bankPopupOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;';
    overlay.innerHTML = `
        <div style="background:white;border-radius:12px;padding:24px;max-width:600px;width:90%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="margin:0;color:#e65100;">📋 未ペアリングの入金 (${unmatchedDeposits.length}件)</h3>
                <button id="closeBankPopup" style="background:none;border:none;font-size:20px;cursor:pointer;color:#666;">✕</button>
            </div>
            <p style="font-size:13px;color:#666;margin-bottom:12px;">受注リストと照合できなかった入金です。卸売振込や受注外の入金が含まれます。</p>
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
                <thead>
                    <tr style="background:#f5f5f5;border-bottom:2px solid #ddd;">
                        <th style="padding:8px 12px;text-align:left;">振込日</th>
                        <th style="padding:8px 12px;text-align:right;">金額</th>
                        <th style="padding:8px 12px;text-align:left;">種別</th>
                        <th style="padding:8px 12px;text-align:left;">振込人名</th>
                    </tr>
                </thead>
                <tbody>${tableRows}</tbody>
                <tfoot>
                    <tr style="border-top:2px solid #ddd;font-weight:bold;">
                        <td style="padding:8px 12px;">合計</td>
                        <td style="padding:8px 12px;text-align:right;">¥${totalAmount.toLocaleString()}</td>
                        <td colspan="2"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
    document.body.appendChild(overlay);

    // 閉じるイベント
    document.getElementById('closeBankPopup').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
}

/**
 * 新規顧客チェックボックスの変更
 */
function handleNewCustomerCheckChange(index) {
    if (newCustomersList[index]) {
        const checkbox = document.getElementById(`newCustomerCheck_${index}`);
        newCustomersList[index].registered = checkbox ? checkbox.checked : false;
    }
    updateRegistrationCompleteButton();
}

/**
 * 登録完了ボタンの状態を更新
 */
function updateRegistrationCompleteButton() {
    const allChecked = newCustomersList.every(c => c.registered);
    const button = document.getElementById('registrationCompleteBtn');
    if (button) {
        button.textContent = allChecked ? '✅ すべての新規顧客を登録しました' : '新規顧客の登録が完了したらチェック';
        button.disabled = !allChecked;
    }
}

/**
 * 新規顧客をTXTで出力
 */
function handleExportNewCustomers() {
    const uncheckedCustomers = newCustomersList.filter(c => !c.registered);
    if (uncheckedCustomers.length === 0) {
        showStatus('⚠️ 出力する顧客がありません（すべて登録済み）', 'error');
        return;
    }
    
    try {
        const txtContent = createNewCustomersTXT(uncheckedCustomers);
        const filename = `ya_n_cstmers_${getDateString()}.txt`;
        downloadAsShiftJIS(txtContent, filename);
        showStatus(`✅ 新規顧客TXTファイルを出力しました（${uncheckedCustomers.length}件）`, 'success');
    } catch (error) {
        showStatus(`❌ 出力エラー: ${error.message}`, 'error');
    }
}

// toHalfWidthKatakana は common/kana-utils.js からインポート

/**
 * 新規顧客TXTを作成（弥生販売の得意先台帳インポート形式）
 */
function createNewCustomersTXT(customers) {
    // TXT形式（タブ区切り、48項目）
    const lines = [];

    customers.forEach(customer => {
        // 住所分割ロジック: 数字（半角・全角）の後のスペース（半角・全角）で分割
        const fullAddress = `${customer.prefecture || ''}${customer.address || ''}`;
        let address1 = fullAddress;
        let address2 = '';

        const addressMatch = fullAddress.match(/^(.+[0-9０-９])[\s　]+(.+)$/);
        if (addressMatch) {
            address1 = addressMatch[1];  // 数字までの部分
            address2 = addressMatch[2];  // スペース以降の部分
        }

        const row = [
            customer.assignedCode,          // 0: コード
            customer.customerName,           // 1: 名称
            toHalfWidthKatakana(customer.furigana || ''), // 2: フリガナ（半角カタカナに変換）
            customer.customerName,           // 3: 略称
            (customer.zip || '').replace(/-/g, ''), // 4: 郵便番号（7桁）
            address1,                       // 5: 住所１（数字まで）
            address2,                       // 6: 住所２（建物名等）
            '',                             // 7: 部署名
            '',                             // 8: 役職名
            '',                             // 9: 担当者
            '様',                           // 10: 敬称
            customer.phone || '',           // 11: TEL
            '',                             // 12: FAX
            '',                             // 13: 携帯
            '',                             // 14: メモ1
            '',                             // 15: メモ2
            '',                             // 16: メモ3
            '',                             // 17: 銀行名
            '',                             // 18: 支店名
            '40000000',                     // 19: 指定売上伝票
            '4104',                         // 20: 指定請求書
            '',                             // 21: 口座名義
            '2',                            // 22: 取引区分（2固定）
            '1',                            // 23: 単価種類（1固定）
            '100',                          // 24: 掛率
            '',                             // 25: 与信限度額
            '',                             // 26: 税率
            '5',                            // 27: 税転嫁（5固定）
            '',                             // 28: 請求締日
            '1',                            // 29: 回収サイクル（1固定）
            '',                             // 30: 回収日
            '1',                            // 31: 手数料負担区分（1固定）
            '',                             // 32: 請求書発行単位
            '',                             // 33: 金額端数処理単位
            '1',                            // 34: 金額端数処理（1固定）
            '1',                            // 35: 税端数処理（1固定）
            '11',                           // 36: 担当者コード（11固定）
            '',                             // 37: ホームページ
            customer.email || '',           // 38: メールアドレス
            '',                             // 39: 参照先
            '1',                            // 40: 参照表示（1固定）
            '',                             // 41: 出力先
            '1',                            // 42: 出力方法（1固定）
            '',                             // 43: ユーザー定義1
            '',                             // 44: ユーザー定義2
            '',                             // 45: ユーザー定義3
            '',                             // 46: ユーザー定義4
            ''                              // 47: ユーザー定義5
        ];

        lines.push(row.join('\t'));
    });

    return lines.join('\r\n');
}

/**
 * 登録完了処理
 */
function handleRegistrationComplete() {
    const allChecked = newCustomersList.every(c => c.registered);
    if (!allChecked) {
        showStatus('⚠️ すべての新規顧客にチェックを入れてください', 'error');
        return;
    }

    // 変換セクション全体を表示
    document.getElementById('convertSection').style.display = 'block';
    document.getElementById('convertBtn').style.display = 'block';
    showStatus('✅ 新規顧客の登録完了を確認しました。変換処理を続けてください。', 'success');
}

/**
 * 顧客台帳を更新してCSV出力
 */
function handleUpdateCustomerList() {
    const registeredCustomers = newCustomersList.filter(c => c.registered);
    if (registeredCustomers.length === 0) {
        showStatus('⚠️ 登録済みの顧客がありません', 'error');
        return;
    }
    
    // 新規顧客を既存顧客リストに追加
    registeredCustomers.forEach(newCust => {
        yayoiCustomers.push({
            customerCode: newCust.assignedCode,
            name: newCust.customerName,
            furigana: '',
            phone: newCust.phone || '',
            email: newCust.email || ''
        });
    });
    
    // LocalStorageを更新
    saveToLocalStorage(yayoiCustomers);
    
    showStatus(`✅ 顧客台帳を更新しました（+${registeredCustomers.length}件）`, 'success');
}

/**
 * チェック済み受注を取得（元インデックス付き）
 */
function getSelectedOrders() {
    return colormeOrders
        .map((order, index) => ({ ...order, _originalIndex: index }))
        .filter(order => {
            const checkbox = document.getElementById(`orderCheck_${order._originalIndex}`);
            return checkbox && checkbox.checked;
        });
}

/**
 * 受注を伝票出力順にソート: 受注日降順（新しい→古い）
 */
function sortOrdersForExport(orders) {
    return [...orders].sort((a, b) => b.orderDate.localeCompare(a.orderDate));
}

/**
 * 予定売上伝票No表示のトグル
 */
function handleToggleDenpyoNo() {
    // トグル: 表示中なら非表示に
    if (currentDenpyoNoMap) {
        currentDenpyoNoMap = null;
        renderOrderList(true);
        return;
    }

    const selectedOrders = getSelectedOrders();
    if (selectedOrders.length === 0) {
        alert('変換する受注をチェックしてください');
        return;
    }

    const denpyoNoStart = document.getElementById('denpyoNoStart')?.value.trim();
    if (!denpyoNoStart) {
        alert('伝票番号（開始番号）を入力してください\n\n変換セクションの「伝票番号（開始番号）」欄に弥生販売の売上伝票新規番号を入力してください。');
        return;
    }

    const sortedOrders = sortOrdersForExport(selectedOrders);

    // Map<originalIndex, 伝票番号文字列> を生成
    currentDenpyoNoMap = new Map();
    let currentNo = parseInt(denpyoNoStart) || 1;
    sortedOrders.forEach(order => {
        currentDenpyoNoMap.set(order._originalIndex, String(currentNo).padStart(4, '0'));
        currentNo++;
    });

    renderOrderList(true);
}

/**
 * 変換処理を実行
 */
function handleConvert() {
    const selectedOrders = getSelectedOrders();

    if (selectedOrders.length === 0) {
        showStatus('⚠️ 変換する受注を選択してください', 'error');
        return;
    }

    // 伝票番号の未入力チェック
    const denpyoNoStart = document.getElementById('denpyoNoStart')?.value.trim();
    if (!denpyoNoStart) {
        showStatus('⚠️ 伝票番号（開始番号）を入力してください', 'error');
        return;
    }

    try {
        const tantoshaCode = '11'; // 固定値
        const sortedOrders = sortOrdersForExport(selectedOrders);

        const txtContent = convertToYayoi(sortedOrders, { denpyoNoStart, tantoshaCode });
        const filename = `ya_sales_${getDateString()}.txt`;
        downloadAsShiftJIS(txtContent, filename);

        showStatus(`✅ 売上伝票TXTファイルを出力しました（${sortedOrders.length}件）`, 'success');
    } catch (error) {
        showStatus(`❌ 変換エラー: ${error.message}`, 'error');
    }
}
