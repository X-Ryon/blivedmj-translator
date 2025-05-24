import { addFavDanmu, renderFavList, showDanmuPopup } from './ui.js';

// =====================
// 元素获取与全局变量
// =====================
let ws = null;
let superchatList = [];

const danmuList = document.getElementById('danmu-list');
const popup = document.getElementById('popup');
const popupContent = document.getElementById('popup-content');
const popupClose = document.getElementById('popup-close');
const configPanel = document.getElementById('config-panel');
const startBtn = document.getElementById('start-btn');
const helpBtn = document.getElementById('help-btn');
const helpPopup = document.getElementById('help-popup');
const helpPopupClose = document.getElementById('help-popup-close');
const logoutBtn = document.getElementById('logout-btn');
const bgBtn = document.getElementById('bg-btn');
const bgFile = document.getElementById('bg-file');
const roomidInfo = document.getElementById('roomid-info');
const roomidValue = document.getElementById('roomid-value');
const usageCount = document.getElementById('usage-count');
const mainArea = document.getElementById('main-area');
const loginWrap = document.getElementById('login-wrap');
const superchatBar = document.getElementById('superchat-bar');
const authorInfo = document.getElementById('author-info');
const giftBar = document.getElementById('gift-bar');
const favListBtn = document.getElementById('fav-list-btn');
const favListPopup = document.getElementById('fav-list-popup');

// =====================
// 页面初始化与配置加载
// =====================
window.onload = async function() {
    // 获取上次参数
    const resp = await fetch('/config');
    if (resp.ok) {
        const data = await resp.json();
        if (data.appid) document.getElementById('appid').value = data.appid;
        if (data.secret) document.getElementById('secret').value = data.secret;
        if (data.sessdata) document.getElementById('sessdata').value = data.sessdata;
        if (data.roomid) document.getElementById('roomid').value = data.roomid;
    }
};

// =====================
// 收藏列表弹窗
// =====================
favListBtn.onclick = function() {
    popup.style.display = 'none'; // 打开收藏列表时关闭原文弹窗
    if (favListPopup.style.display === 'flex') {
        favListPopup.style.display = 'none';
    } else {
        renderFavList();
        favListPopup.style.display = 'flex';
    }
};

// =====================
// 主流程：登录、WebSocket、弹幕处理
// =====================
superchatBar.style.display = 'flex';
logoutBtn.style.display = 'none';

startBtn.onclick = async function() {
    // 参数校验
    const appid = document.getElementById('appid').value.trim();
    const secret = document.getElementById('secret').value.trim();
    let sessdata = document.getElementById('sessdata').value.trim();
    let roomid = document.getElementById('roomid').value.trim();
    if (!appid && !secret && !roomid) {
        alert('请填写正确的直播间房间号、APPID和密钥!');
        return;
    }
    if (!appid || !secret) {
        alert('请填写正确的APPID和密钥!');
        return;
    }
    if (!roomid) {
        alert('请填写正确的直播间房间号!');
        return;
    }
    if (!sessdata) sessdata = "";

    // 发送参数到后端
    await fetch('/config', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({appid, secret, sessdata, roomid})
    });

    // UI切换
    loginWrap.style.display = 'none';
    mainArea.style.display = 'flex';
    danmuList.style.display = '';
    logoutBtn.style.display = '';
    roomidInfo.style.display = 'flex';
    roomidValue.textContent = roomid;
    roomidValue.title = roomid;
    authorInfo.style.display = 'none';

    // 1. 拉取历史数据
    const resp = await fetch('/history');
    if (resp.ok) {
        const history = await resp.json();
        // 渲染历史弹幕
        if (Array.isArray(history.danmu)) {
            history.danmu.forEach(d => {
                handleDanmu(d, true);
            });
        }
        // 渲染历史礼物
        if (Array.isArray(history.gift)) {
            history.gift.forEach(g => {
                handleGift(g);
            });
        }
        // 渲染历史醒目留言
        if (Array.isArray(history.superchat)) {
            history.superchat.forEach(sc => {
                handleSuperchat(sc);
            });
        }
        // 渲染历史收藏
        if (Array.isArray(history.danmu)) {
            history.danmu.forEach(d => {
                if (d.fav) {
                    addFavDanmu(d);
                }
            });
        }
    }

    // 启动WebSocket
    ws = new WebSocket('ws://localhost:8765/');
    ws.onmessage = function(event) {
        handleWsMessage(event);
    };
};

// =====================
// WebSocket消息处理
// =====================
function handleWsMessage(event) {
    const threshold = 5;
    const isAtBottom = Math.abs(danmuList.scrollTop + danmuList.clientHeight - danmuList.scrollHeight) < threshold;
    const data = JSON.parse(event.data);

    // 醒目留言
    if (data.type === 'superchat') {
        handleSuperchat(data);
        return;
    }

    // 礼物
    if (data.type === 'gift') {
        handleGift(data);
        return;
    }

    // 用量更新
    if (typeof data.char_count !== 'undefined') {
        usageCount.textContent = data.char_count;
        usageCount.title = data.char_count;
    }

    // 普通弹幕
    handleDanmu(data, isAtBottom);
}

function handleSuperchat(data) {
    // 弹幕区
    const item = document.createElement('div');
    item.className = 'danmu-item danmu-superchat';
    item.innerHTML = `
      <div class="superchat-header">
        <span class="superchat-price">¥${data.price}</span>
        <span class="superchat-uname">${data.uname}</span>
      </div>
      <div class="superchat-msg">${data.msg}</div>
    `;
    item.dataset.uname = data.uname;
    item.dataset.msg = data.msg;
    item.dataset.price = data.price;
    item.dataset.fav = "false";
    item.onclick = function() {
        showDanmuPopup({
            type: 'superchat',
            price: data.price,
            uname: data.uname,
            msg: data.msg,
            origin: data.origin,
            marked: item.dataset.fav === "true"
        });
    };
    danmuList.appendChild(item);

    // 上方栏
    superchatBar.style.display = 'flex';
    const scItem = document.createElement('div');
    scItem.className = 'superchat-item';
    scItem.innerHTML = `<span class="superchat-price">¥${data.price}</span> <span class="superchat-uname">${data.uname}</span>`;
    scItem.title = data.msg;
    scItem.dataset.msg = data.msg;
    scItem.dataset.origin = data.origin;
    scItem.dataset.uname = data.uname;
    scItem.dataset.price = data.price;
    scItem.dataset.fav = "false";
    scItem.onclick = function() {
        showDanmuPopup({
            type: 'superchat',
            price: scItem.dataset.price,
            uname: scItem.dataset.uname,
            msg: scItem.dataset.msg,
            origin: scItem.dataset.origin,
            marked: scItem.dataset.fav === "true"
        });
    };
    const isAtRight = Math.abs(superchatBar.scrollLeft + superchatBar.clientWidth - superchatBar.scrollWidth) < 2;
    superchatBar.appendChild(scItem);
    if (isAtRight) {
        superchatBar.scrollLeft = superchatBar.scrollWidth;
    }
    superchatList.push(scItem);
}

function handleGift(data) {
    const item = document.createElement('div');
    item.className = 'gift-item';
    item.innerHTML = `
        <span class="gift-uname">${data.uname}</span>
        <span class="gift-name">${data.trans_name}</span>
        <span class="gift-num">x${data.num}</span>
    `;
    item.title = `¥ ${data.price} ${data.uname} 赠送 ${data.trans_name} x${data.num}`;
    item.onclick = function() {
        showDanmuPopup({
            type: 'gift',
            uname: data.uname,
            msg: `${data.trans_name} x${data.num} ¥${data.price}`,
            origin: `${data.gift_name} x${data.num} ¥${data.price}`,
            price: data.price
        });
    };
    const isAtRight = Math.abs(giftBar.scrollLeft + giftBar.clientWidth - giftBar.scrollWidth) < 2;
    giftBar.appendChild(item);
    if (isAtRight) {
        giftBar.scrollLeft = giftBar.scrollWidth;
    }

    // 新增：推送礼物数据到礼物详情窗口
    if (window._giftDetailWin && !window._giftDetailWin.closed) {
        window._giftDetailWin.postMessage({ type: 'gift', data }, '*');
    }
}

function handleDanmu(data, isAtBottom) {
    const item = document.createElement('div');
    item.className = 'danmu-item';

    // 身份 class
    let privilege = data.privilege || "白字";
    if (privilege === "舰长") item.classList.add('danmu-jianzhang');
    else if (privilege === "提督") item.classList.add('danmu-tidu');
    else if (privilege === "总督") item.classList.add('danmu-zongdu');
    else if (privilege === "房管") item.classList.add('danmu-fangguan');
    else item.classList.add('danmu-normal');

    // dataset 字段
    item.dataset.privilege = privilege;
    item.dataset.origin = data.origin || '';
    item.dataset.uname = data.uname;
    item.dataset.msg = data.msg;
    item.dataset.fav = "false";

    // 动画
    item.style.animation = 'none';
    void item.offsetWidth;
    item.style.animation = '';

    // 头像
    let avatarUrl = data.face || data.uface || '';
    if (!avatarUrl) {
        avatarUrl = 'https://static.hdslb.com/images/member/noface.gif';
    }
    const avatar = document.createElement('img');
    avatar.className = 'danmu-avatar';
    avatar.src = avatarUrl.replace(/^http:/, 'https:');
    avatar.alt = '头像';
    avatar.referrerPolicy = "no-referrer";

    // 昵称与内容
    const text = document.createElement('span');
    text.textContent = `${data.uname}：${data.msg}`;

    item.appendChild(avatar);
    item.appendChild(text);

    item.onclick = function(e) {
        showDanmuPopup({
            type: 'danmu',
            uname: data.uname,
            msg: data.msg,
            origin: data.origin,
            marked: item.dataset.fav === "true"
        });
    };
    danmuList.appendChild(item);

    if (isAtBottom) {
        danmuList.scrollTop = danmuList.scrollHeight - danmuList.clientHeight;
    }
}

// =====================
// 退出登录
// =====================
logoutBtn.onclick = async function() {
    await fetch('/logout', {method: 'POST'});
    danmuList.style.display = 'none';
    loginWrap.style.display = 'flex';
    mainArea.style.display = 'none';
    logoutBtn.style.display = 'none';
    roomidInfo.style.display = 'none';
    danmuList.innerHTML = '';
    giftBar.innerHTML = '';
    popup.style.display = 'none';
    helpPopup.style.display = 'none';
    authorInfo.style.display = '';
    favListPopup.style.display = 'none';

    // 清空收藏列表并刷新
    localStorage.removeItem('favDanmuList');
    renderFavList();
    Array.from(danmuList.children).forEach(item => item.dataset.fav = "false");
    Array.from(superchatBar.children).forEach(item => item.dataset.fav = "false");
};

// =====================
// 弹窗与帮助
// =====================
popupClose.onclick = function() {
    popup.style.display = 'none';
};
helpBtn.onclick = function() {
    helpPopup.style.display = 'block';
};
helpPopupClose.onclick = function() {
    helpPopup.style.display = 'none';
};
window.onclick = function(event) {
    if (event.target === popup) popup.style.display = 'none';
    if (event.target === helpPopup) helpPopup.style.display = 'none';
};

// =====================
// 页面关闭前通知后端
// =====================
window.addEventListener('beforeunload', function() {
    navigator.sendBeacon('/shutdown');
});

// =====================
// 背景更换相关
// =====================
bgBtn.onclick = function() {
    bgFile.value = '';
    bgFile.click();
};
bgFile.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) {
        document.documentElement.style.backgroundImage = "url('/frontend/bg.png?ts=" + Date.now() + "')";
        document.documentElement.style.backgroundColor = "#fff";
        return;
    }
    const formData = new FormData();
    formData.append('file', file);
    fetch('/upload_bg', {
        method: 'POST',
        body: formData
    }).then(res => {
        if (res.ok) {
            document.documentElement.style.backgroundImage = "url('/frontend/bg.png?ts=" + Date.now() + "')";
            document.documentElement.style.backgroundColor = "#fff";
        } else {
            alert('上传失败');
        }
    });
};

const removeBgBtn = document.getElementById('remove-bg-btn');
const confirmBgModal = document.getElementById('confirm-bg-modal');
const confirmBgOk = document.getElementById('confirm-bg-ok');
const confirmBgCancel = document.getElementById('confirm-bg-cancel');

removeBgBtn.onclick = function() {
    confirmBgModal.style.display = 'flex';
};
confirmBgOk.onclick = function() {
    document.documentElement.style.backgroundImage = '';
    document.documentElement.style.backgroundColor = '#fff';
    confirmBgModal.style.display = 'none';
};
confirmBgCancel.onclick = function() {
    confirmBgModal.style.display = 'none';
};
confirmBgModal.onclick = function(e) {
    if (e.target === confirmBgModal) {
        confirmBgModal.style.display = 'none';
    }
};

// 页面加载时自动恢复背景
window.addEventListener('DOMContentLoaded', function() {
    const img = new Image();
    img.onload = function() {
        document.documentElement.style.backgroundImage = "url('/frontend/bg.png')";
    };
    img.onerror = function() {
        document.documentElement.style.backgroundImage = '';
    };
    img.src = '/frontend/bg.png';
});

// =====================
// 弹幕区 padding 自适应
// =====================
function adjustDanmuPadding() {
    const authorInfo = document.getElementById('author-info');
    const danmuList = document.getElementById('danmu-list');
    if (authorInfo && danmuList) {
        const authorHeight = authorInfo.offsetHeight;
        danmuList.style.paddingBottom = (authorHeight + 24) + 'px';
    }
}
window.addEventListener('DOMContentLoaded', adjustDanmuPadding);
window.addEventListener('resize', adjustDanmuPadding);

// =====================
// 清屏相关
// =====================
const clearBtn = document.getElementById('clear-btn');
const confirmClearModal = document.getElementById('confirm-clear-modal');
const confirmClearOk = document.getElementById('confirm-clear-ok');
const confirmClearCancel = document.getElementById('confirm-clear-cancel');
const clearDanmu = document.getElementById('clear-danmu');
const clearSuperchat = document.getElementById('clear-superchat');
const clearFav = document.getElementById('clear-fav');
const clearGift = document.getElementById('clear-gift');

clearBtn.onclick = function() {
    clearDanmu.checked = true;
    clearSuperchat.checked = false;
    clearFav.checked = false;
    clearGift.checked = false;
    confirmClearModal.style.display = 'flex';
};

confirmClearOk.onclick = function() {
    const types = [];
    if (clearDanmu.checked) {
        danmuList.innerHTML = '';
        types.push('danmu');
    }
    if (clearSuperchat.checked) {
        superchatBar.innerHTML = '';
        if (typeof superchatList !== 'undefined') superchatList.length = 0;
        types.push('superchat');
    }
    if (clearGift.checked) {
        giftBar.innerHTML = '';
        localStorage.setItem('clearGiftSignal', Date.now().toString());
        types.push('gift');
    }
    if (clearFav.checked) {
        localStorage.removeItem('favDanmuList');
        renderFavList();
        Array.from(danmuList.children).forEach(item => item.dataset.fav = "false");
        Array.from(superchatBar.children).forEach(item => item.dataset.fav = "false");
        types.push('fav');
    }
    if (types.length > 0) {
        fetch('/clear_history', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ types })
        });
    }
    confirmClearModal.style.display = 'none';
};

confirmClearCancel.onclick = function() {
    confirmClearModal.style.display = 'none';
};
confirmClearModal.onclick = function(e) {
    if (e.target === confirmClearModal) {
        confirmClearModal.style.display = 'none';
    }
};

// =====================
// 收藏标记同步
// =====================
function markFavStatus(uname, msg, price = null) {
    Array.from(danmuList.children).forEach(item => {
        if (
            item.dataset.uname === uname &&
            item.dataset.msg === msg &&
            (price === null || item.dataset.price == price)
        ) {
            item.dataset.fav = "true";
        }
    });
    Array.from(superchatBar.children).forEach(item => {
        if (
            item.dataset.uname === uname &&
            item.dataset.msg === msg &&
            (price === null || item.dataset.price == price)
        ) {
            item.dataset.fav = "true";
        }
    });
}
function unmarkFavStatus(uname, msg, price = null) {
    Array.from(danmuList.children).forEach(item => {
        if (
            item.dataset.uname === uname &&
            item.dataset.msg === msg &&
            (price === null || item.dataset.price == price)
        ) {
            item.dataset.fav = "false";
        }
    });
    Array.from(superchatBar.children).forEach(item => {
        if (
            item.dataset.uname === uname &&
            item.dataset.msg === msg &&
            (price === null || item.dataset.price == price)
        ) {
            item.dataset.fav = "false";
        }
    });
}
window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'markFav') {
        markFavStatus(e.data.uname, e.data.msg, e.data.price);
    }
    if (e.data && e.data.type === 'unmarkFav') {
        unmarkFavStatus(e.data.uname, e.data.msg, e.data.price);
    }
});
