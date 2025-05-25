let ws = null;
let giftList = [];

function renderGiftList() {
    const list = document.getElementById('gift-list');
    list.innerHTML = '';
    if (giftList.length === 0) {
        list.innerHTML = '<div id="empty-tip">暂无礼物</div>';
        return;
    }
    giftList.forEach(g => {
        const item = document.createElement('div');
        item.className = 'gift-item';
        item.innerHTML = `
            <span class="gift-uname">${g.uname}</span>
            <span class="gift-name">${g.gift_name}</span>
            <span class="gift-num">x${g.num}</span>
            <span class="gift-price">￥${g.price}</span>
        `;
        list.appendChild(item);
    });
}

function addGift(gift) {
    giftList.push(gift);
    if (giftList.length > 80) giftList.shift();
    renderGiftList();
}

function clearGiftList() {
    giftList = [];
    renderGiftList();
}

function connectWs() {
    if (ws) {
        ws.close();
        ws = null;
    }
    ws = new WebSocket('ws://localhost:8765/');
    ws.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'gift') {
                addGift(data);
            }
        } catch {}
    };
}

function loadHistory() {
    fetch('/history').then(res => res.json()).then(data => {
        giftList = Array.isArray(data.gift) ? data.gift : [];
        renderGiftList();
    });
}

// 接收主窗口消息
window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'login') {
        loadHistory();
        connectWs();
    }
    if (e.data.type === 'logout') {
        clearGiftList();
        if (ws) { ws.close(); ws = null; }
        window.close && window.close();
    }
    if (e.data.type === 'clearGift') {
        clearGiftList();
    }
});

// 自动加载历史并连接ws（如果主窗口未主动通知，可手动刷新）
window.onload = function() {
    loadHistory();
    connectWs();
};