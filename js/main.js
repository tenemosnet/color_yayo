/**
 * main.js - メインロジックとイベントハンドラ
 * ver 3.2 - UI改善版
 */

import { checkStoredData, saveToLocalStorage, loadFromLocalStorage, clearLocalStorage, exportToJSON, importFromJSON } from './storage.js';
import { parseColorMeCSV, parseYayoiCSV } from './parser.js';
import { performCustomerMatching } from './matcher.js';
import { convertToYayoi, downloadAsShiftJIS } from './converter.js';
import { showStatus, displaySummary, displayNewCustomers, displayOrders, toggleHelpModal, toggleAdvancedSettings, displayFileName, setButtonEnabled, getDateString } from './ui.js';

// グローバル変数
let colormeOrders = [];
let yayoiCustomers = [];
let newCustomersList = [];
let displayedOrders = [];

// ページ読み込み時の初期化
window.addEventListener('DOMContentLoaded', () => {
    checkStoredData();
    setupEventListeners();
});

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
 * 弥生販売CSVファイルを処理
 */
function handleYayoiFile(file) {
    if (!file.name.endsWith('.csv')) {
        showStatus('CSVファイルを選択してください', 'error');
        return;
    }

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
        } catch (error) {
            showStatus(`❌ エラー: ${error.message}`, 'error');
        }
    };
    reader.readAsText(file, 'UTF-8');
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
    displayedOrders = displayOrders(colormeOrders);

    // 全選択チェックボックスのイベント
    document.getElementById('selectAllOrders')?.addEventListener('change', handleSelectAll);

    // 各チェックボックスのイベント
    colormeOrders.forEach((order, index) => {
        const checkbox = document.getElementById(`orderCheck_${index}`);
        if (checkbox) {
            checkbox.addEventListener('change', () => handleOrderCheckChange(index));
        }
    });

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

/**
 * 全角カタカナを半角カタカナに変換
 */
function toHalfWidthKatakana(str) {
    if (!str) return '';

    const kanaMap = {
        'ガ': 'ｶﾞ', 'ギ': 'ｷﾞ', 'グ': 'ｸﾞ', 'ゲ': 'ｹﾞ', 'ゴ': 'ｺﾞ',
        'ザ': 'ｻﾞ', 'ジ': 'ｼﾞ', 'ズ': 'ｽﾞ', 'ゼ': 'ｾﾞ', 'ゾ': 'ｿﾞ',
        'ダ': 'ﾀﾞ', 'ヂ': 'ﾁﾞ', 'ヅ': 'ﾂﾞ', 'デ': 'ﾃﾞ', 'ド': 'ﾄﾞ',
        'バ': 'ﾊﾞ', 'ビ': 'ﾋﾞ', 'ブ': 'ﾌﾞ', 'ベ': 'ﾍﾞ', 'ボ': 'ﾎﾞ',
        'パ': 'ﾊﾟ', 'ピ': 'ﾋﾟ', 'プ': 'ﾌﾟ', 'ペ': 'ﾍﾟ', 'ポ': 'ﾎﾟ',
        'ヴ': 'ｳﾞ', 'ヷ': 'ﾜﾞ', 'ヺ': 'ｦﾞ',
        'ア': 'ｱ', 'イ': 'ｲ', 'ウ': 'ｳ', 'エ': 'ｴ', 'オ': 'ｵ',
        'カ': 'ｶ', 'キ': 'ｷ', 'ク': 'ｸ', 'ケ': 'ｹ', 'コ': 'ｺ',
        'サ': 'ｻ', 'シ': 'ｼ', 'ス': 'ｽ', 'セ': 'ｾ', 'ソ': 'ｿ',
        'タ': 'ﾀ', 'チ': 'ﾁ', 'ツ': 'ﾂ', 'テ': 'ﾃ', 'ト': 'ﾄ',
        'ナ': 'ﾅ', 'ニ': 'ﾆ', 'ヌ': 'ﾇ', 'ネ': 'ﾈ', 'ノ': 'ﾉ',
        'ハ': 'ﾊ', 'ヒ': 'ﾋ', 'フ': 'ﾌ', 'ヘ': 'ﾍ', 'ホ': 'ﾎ',
        'マ': 'ﾏ', 'ミ': 'ﾐ', 'ム': 'ﾑ', 'メ': 'ﾒ', 'モ': 'ﾓ',
        'ヤ': 'ﾔ', 'ユ': 'ﾕ', 'ヨ': 'ﾖ',
        'ラ': 'ﾗ', 'リ': 'ﾘ', 'ル': 'ﾙ', 'レ': 'ﾚ', 'ロ': 'ﾛ',
        'ワ': 'ﾜ', 'ヲ': 'ｦ', 'ン': 'ﾝ',
        'ァ': 'ｧ', 'ィ': 'ｨ', 'ゥ': 'ｩ', 'ェ': 'ｪ', 'ォ': 'ｫ',
        'ッ': 'ｯ', 'ャ': 'ｬ', 'ュ': 'ｭ', 'ョ': 'ｮ',
        'ー': 'ｰ', '・': '･', '「': '｢', '」': '｣', '。': '｡', '、': '､', '　': ' '
    };

    let result = '';
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        result += kanaMap[char] || char;
    }

    return result;
}

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
            '334401',                       // 19: 指定売上伝票（334401固定）
            '',                             // 20: 口座番号
            '',                             // 21: 口座名義
            '2',                            // 22: 取引区分（2固定）
            '1',                            // 23: 単価種類（1固定）
            '',                             // 24: 掛率
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
 * 変換処理を実行
 */
function handleConvert() {
    // チェックされた受注のみを変換
    const selectedOrders = colormeOrders.filter((order, index) => {
        const checkbox = document.getElementById(`orderCheck_${index}`);
        return checkbox && checkbox.checked;
    });

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

        const txtContent = convertToYayoi(selectedOrders, { denpyoNoStart, tantoshaCode });
        const filename = `ya_sales_${getDateString()}.txt`;
        downloadAsShiftJIS(txtContent, filename);

        showStatus(`✅ 売上伝票TXTファイルを出力しました（${selectedOrders.length}件）`, 'success');
    } catch (error) {
        showStatus(`❌ 変換エラー: ${error.message}`, 'error');
    }
}
