/**
 * ui.js - UI操作とイベントハンドラ
 * ver 3.5 - Excel対応版 + 代引き手数料表示修正
 */

import { calculateCODFee } from '../common/config.js';

/**
 * ステータスメッセージを表示
 * @param {string} message - メッセージ
 * @param {string} type - タイプ（success, error, info）
 */
export function showStatus(message, type = 'info') {
    const status = document.getElementById('status');
    if (!status) return;
    
    const className = {
        success: 'status-success',
        error: 'status-error',
        info: 'status-info'
    }[type] || 'status-info';
    
    status.className = className;
    status.textContent = message;
    status.style.display = 'block';
    
    // 成功メッセージは5秒後に自動で消す
    if (type === 'success') {
        setTimeout(() => {
            status.style.display = 'none';
        }, 5000);
    }
}

/**
 * サマリー情報を表示
 */
export function displaySummary(data) {
    const { totalOrders, existingCount, newCount, maxCode, nextCode } = data;
    
    document.getElementById('totalOrders').textContent = totalOrders;
    document.getElementById('existingCustomers').textContent = existingCount;
    document.getElementById('newCustomers').textContent = newCount;
    document.getElementById('maxCustomerCode').textContent = String(maxCode).padStart(6, '0');
    document.getElementById('nextCustomerCode').textContent = String(nextCode).padStart(6, '0');
    document.getElementById('summarySection').style.display = 'block';
}

/**
 * 新規顧客リストを表示
 */
export function displayNewCustomers(customers) {
    const section = document.getElementById('newCustomersSection');
    const list = document.getElementById('newCustomersList');
    
    // 新規顧客が0件の場合
    if (customers.length === 0) {
        list.innerHTML = `
            <div style="background: #e8f5e9; border: 2px solid #4caf50; border-radius: 10px; padding: 30px; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 15px;">✅</div>
                <div style="font-size: 20px; color: #2e7d32; font-weight: bold; margin-bottom: 10px;">
                    新規登録が必要な顧客はありません
                </div>
                <div style="font-size: 14px; color: #558b2f;">
                    すべての顧客が弥生販売に登録済みです。このまま変換処理を続けてください。
                </div>
            </div>
        `;
        section.style.display = 'block';
        document.getElementById('registrationCompleteBtn').style.display = 'none';
        document.getElementById('exportNewCustomersBtn').style.display = 'none';
        document.getElementById('convertBtn').style.display = 'block';
        return customers;
    }
    
    // 新規顧客が1件以上の場合
    let html = '<table class="new-customers-table"><thead><tr>';
    html += '<th class="checkbox-cell">登録完了</th>';
    html += '<th style="width: 80px;">顧客コード</th>';
    html += '<th style="width: 150px;">名前</th>';
    html += '<th style="width: 100px;">郵便番号</th>';
    html += '<th>住所</th>';
    html += '<th style="width: 200px;">メールアドレス</th>';
    html += '<th style="width: 120px;">電話番号</th>';
    html += '</tr></thead><tbody>';
    
    customers.forEach((customer, index) => {
        // 郵便番号のフォーマット（7桁 → XXX-XXXX）
        let zipFormatted = customer.zip || '';
        if (zipFormatted.length === 7) {
            zipFormatted = zipFormatted.substring(0, 3) + '-' + zipFormatted.substring(3);
        }
        
        const fullAddress = `${customer.prefecture || ''}${customer.address || ''}`;
        
        html += `<tr>
            <td class="checkbox-cell">
                <input type="checkbox" id="newCustomerCheck_${index}" data-index="${index}" />
            </td>
            <td class="customer-code-cell">${customer.assignedCode}</td>
            <td class="customer-name-cell">${customer.customerName}</td>
            <td>〒${zipFormatted || '-'}</td>
            <td>${fullAddress || '-'}</td>
            <td>${customer.email || '-'}</td>
            <td>${customer.phone || '-'}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    
    list.innerHTML = html;
    section.style.display = 'block';
    document.getElementById('registrationCompleteBtn').style.display = 'inline-block';
    document.getElementById('exportNewCustomersBtn').style.display = 'inline-block';
    
    return customers;
}

/**
 * 受注データリストを表示
 */
export function displayOrders(orders) {
    const section = document.getElementById('ordersSection');
    const list = document.getElementById('ordersList');

    console.log('\n' + '='.repeat(50));
    console.log('📋 受注データ表示処理');
    console.log('総受注件数:', orders.length);
    console.log('='.repeat(50) + '\n');

    // 売上ID降順にソート（カラーミーと同じ順番）
    const sortedOrders = orders.map((order, originalIndex) => ({
        ...order,
        originalIndex: originalIndex
    })).sort((a, b) => {
        const idA = parseInt(a.salesId) || 0;
        const idB = parseInt(b.salesId) || 0;
        return idB - idA; // 降順
    });

    let html = '<table class="orders-table"><thead><tr>';
    html += '<th class="checkbox-cell"><input type="checkbox" id="selectAllOrders" /></th>';
    html += '<th style="width: 100px;">売上ID</th>';
    html += '<th style="width: 100px;">受注日</th>';
    html += '<th style="width: 120px;">名前</th>';
    html += '<th style="width: 60px;">商品<br>点数</th>';
    html += '<th style="width: 90px;">売上合計</th>';
    html += '<th style="width: 90px;">決済方法</th>';
    html += '<th style="width: 70px;">顧客状態</th>';
    html += '<th style="width: 80px;">得意先<br>コード</th>';
    html += '</tr></thead><tbody>';

    sortedOrders.forEach((order, index) => {
        const originalIndex = order.originalIndex;
        const itemCount = order.items.length;

        // 商品小計
        const itemsTotal = order.items.reduce((sum, item) => sum + item.subtotal, 0);

        // 代引きは青色表示 + デフォルトチェック
        // 決済方法が「代引き」、または決済手数料が設定されている場合
        const isCOD = order.paymentMethod.includes('代引') || (order.paymentFee > 0);

        // 代引き手数料（CSVの決済手数料を優先、なければ自動計算）
        let codFee = 0;
        if (isCOD) {
            const paymentTotal = itemsTotal + order.shippingFee;
            codFee = order.paymentFee > 0 ? order.paymentFee : calculateCODFee(paymentTotal);
        }

        // 売上合計（商品小計 + 送料 + 代引き手数料 - 割引）
        const total = itemsTotal + order.shippingFee + codFee - order.discountAmount;

        // 最初の3件だけ詳細ログを出力
        if (index < 3) {
            console.log(`受注 #${order.salesId}:`, {
                顧客名: order.customerName,
                決済方法: order.paymentMethod,
                代引き判定: isCOD,
                商品小計: itemsTotal,
                送料: order.shippingFee,
                代引き手数料: codFee,
                割引: order.discountAmount,
                売上合計: total
            });
        }

        let statusBadge;
        if (order.matchedCustomer) {
            if (order.matchWarnings && order.matchWarnings.length > 0) {
                const warningTitles = order.matchWarnings.map(w => `${w.label}: ${w.detail}`).join('&#10;');
                statusBadge = `<span class="status-badge warning" title="${warningTitles}">⚡ 要確認</span>`;
            } else {
                statusBadge = '<span class="status-badge existing">✅ 既存</span>';
            }
        } else {
            statusBadge = '<span class="status-badge new">⚠️ 新規</span>';
        }

        const rowClass = order.matchedCustomer ? 'existing-customer' : 'new-customer';

        const paymentColor = isCOD ? 'color: #2196F3;' : '';
        const paymentDisplay = isCOD ? '代引き' : order.paymentMethod;
        const defaultChecked = isCOD ? 'checked' : '';
        
        html += `<tr class="${rowClass}">
            <td class="checkbox-cell">
                <input type="checkbox" id="orderCheck_${originalIndex}" data-index="${originalIndex}" ${defaultChecked} />
            </td>
            <td class="sales-id-cell" style="font-weight: bold;">${order.salesId}</td>
            <td>${order.orderDate}</td>
            <td class="customer-name-cell" style="font-weight: bold;">${order.customerName}</td>
            <td style="text-align: center;">${itemCount}</td>
            <td class="amount-cell" style="font-weight: bold;">¥${total.toLocaleString()}</td>
            <td style="${paymentColor} font-weight: bold;">${paymentDisplay}</td>
            <td>${statusBadge}</td>
            <td class="customer-code-cell" style="font-weight: bold; color: #d32f2f;">${order.tokuisakiCode}</td>
        </tr>`;
    });
    
    html += '</tbody></table>';
    
    list.innerHTML = html;
    section.style.display = 'block';

    // 売上伝票設定セクションと変換ボタンを表示
    document.getElementById('convertSection').style.display = 'block';
    document.getElementById('convertBtn').style.display = 'block';

    return sortedOrders;
}

/**
 * ヘルプモーダルを表示/非表示
 */
export function toggleHelpModal(show) {
    const modal = document.getElementById('helpModal');
    if (modal) {
        modal.style.display = show ? 'flex' : 'none';
    }
}

/**
 * 折りたたみメニューをトグル
 */
export function toggleAdvancedSettings() {
    const content = document.getElementById('advancedSettingsContent');
    const icon = document.getElementById('advancedSettingsIcon');
    const button = document.getElementById('advancedSettingsToggle');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▲';
        button.style.background = '#e8f5e9';
        button.style.borderColor = '#4caf50';
    } else {
        content.style.display = 'none';
        icon.textContent = '▼';
        button.style.background = '#f5f5f5';
        button.style.borderColor = '#ddd';
    }
}

/**
 * ファイル名を表示
 */
export function displayFileName(elementId, filename, color = '#4caf50') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = `📄 ${filename}`;
        element.style.color = color;
    }
}

/**
 * ボタンの有効/無効を切り替え
 */
export function setButtonEnabled(elementId, enabled) {
    const button = document.getElementById(elementId);
    if (button) {
        button.disabled = !enabled;
    }
}

/**
 * 日付文字列を生成（YYYYMMDD形式）
 */
export function getDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}
