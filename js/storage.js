/**
 * storage.js - LocalStorage操作
 * ver 3.2 - UI改善版
 */

import { APP_VERSION, STORAGE_KEY } from './config.js';

/**
 * LocalStorageのデータをチェック
 */
export function checkStoredData() {
    try {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (storedData) {
            const data = JSON.parse(storedData);
            
            // データ表示エリアを表示
            document.getElementById('storedDataInfo').style.display = 'block';
            document.getElementById('storedCustomerCount').textContent = data.customerCount || 0;
            document.getElementById('storedLastUpdate').textContent = data.timestamp || '-';
            document.getElementById('storedVersion').textContent = data.version || '-';
            
            return data;
        }
        return null;
    } catch (error) {
        console.error('LocalStorageの読み込みエラー:', error);
        return null;
    }
}

/**
 * データをLocalStorageに保存
 */
export function saveToLocalStorage(customers) {
    try {
        const now = new Date();
        const timestamp = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        
        const storageData = {
            version: APP_VERSION,
            timestamp: timestamp,
            yayoiCustomers: customers,
            customerCount: customers.length
        };
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
        checkStoredData(); // 表示を更新
        
        return true;
    } catch (error) {
        console.error('LocalStorageへの保存エラー:', error);
        return false;
    }
}

/**
 * LocalStorageからデータを取得
 */
export function loadFromLocalStorage() {
    try {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (!storedData) {
            return null;
        }
        
        const data = JSON.parse(storedData);
        return data.yayoiCustomers || [];
    } catch (error) {
        console.error('LocalStorageの読み込みエラー:', error);
        return null;
    }
}

/**
 * LocalStorageをクリア
 */
export function clearLocalStorage() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        document.getElementById('storedDataInfo').style.display = 'none';
        return true;
    } catch (error) {
        console.error('LocalStorageのクリアエラー:', error);
        return false;
    }
}

/**
 * データをJSONファイルとして出力
 */
export function exportToJSON() {
    try {
        const storedData = localStorage.getItem(STORAGE_KEY);
        if (!storedData) {
            return { success: false, message: '保存データがありません' };
        }
        
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const filename = `yayoi_storage_${dateStr}.json`;
        
        const blob = new Blob([storedData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        return { success: true, message: `データを ${filename} として出力しました` };
    } catch (error) {
        return { success: false, message: 'データの出力に失敗しました: ' + error.message };
    }
}

/**
 * JSONファイルからデータを読み込み
 */
export function importFromJSON(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                
                // データ検証
                if (!data.yayoiCustomers || !Array.isArray(data.yayoiCustomers)) {
                    reject(new Error('無効なデータ形式です'));
                    return;
                }
                
                // LocalStorageに保存
                localStorage.setItem(STORAGE_KEY, event.target.result);
                checkStoredData();
                
                resolve({
                    success: true,
                    customers: data.yayoiCustomers,
                    message: `データ（${data.yayoiCustomers.length}件）を読み込みました`
                });
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
        reader.readAsText(file);
    });
}
