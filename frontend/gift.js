const giftDetailList = document.getElementById('gift-detail-list');

function connectGiftWS() {
    let ws = new WebSocket('ws://localhost:8765/');
    ws.onopen = function() {
        console.log('礼物窗口 WebSocket 已连接');
    };
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.type === 'gift') {
            const item = document.createElement('div');
            item.className = 'danmu-item danmu-gift';
            item.innerHTML = `
                <span class="gift-uname">${data.uname}</span>
                <span class="gift-name">${data.gift_name}</span>
                <span class="gift-num">x${data.num}</span>
                <span class="gift-price" style="color:#ff9800;margin-left:8px;">${data.price ? '￥'+data.price : ''}</span>
            `;
            giftDetailList.appendChild(item);
            giftDetailList.scrollTop = giftDetailList.scrollHeight;
        }
    };
    ws.onerror = function(e) {
        console.error('礼物窗口 WebSocket 错误', e);
    };
    ws.onclose = function() {
        // 2秒后自动重连
        setTimeout(connectGiftWS, 2000);
    };
}

connectGiftWS();

window.addEventListener('storage', function(e) {
    if (e.key === 'clearGiftSignal') {
        const giftDetailList = document.getElementById('gift-detail-list');
        if (giftDetailList) giftDetailList.innerHTML = '';
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const giftDetailList = document.getElementById('gift-detail-list');
    // 恢复历史
    const giftRaw = localStorage.getItem('giftHistory');
    if (giftRaw && giftDetailList) {
        const giftHistory = JSON.parse(giftRaw);
        giftHistory.forEach(data => {
            const item = document.createElement('div');
            item.className = 'danmu-item danmu-gift';
            item.innerHTML = `
                <span class="gift-uname">${data.uname}</span>
                <span class="gift-name">${data.gift_name}</span>
                <span class="gift-num">x${data.num}</span>
                <span class="gift-price" style="color:#ff9800;margin-left:8px;">${data.price ? '￥'+data.price : ''}</span>
            `;
            giftDetailList.appendChild(item);
        });
    }
});