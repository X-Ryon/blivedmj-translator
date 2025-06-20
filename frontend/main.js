import { addFavDanmu, renderFavList, showDanmuPopup } from './ui.js';

// 新增：全局收藏列表同步
let favDanmuList = JSON.parse(localStorage.getItem('favDanmuList') || '[]');
window.addEventListener('storage', function(e) {
    if (e.key === 'favDanmuList') {
        favDanmuList = JSON.parse(localStorage.getItem('favDanmuList') || '[]');
    }
});
window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'favListSync') {
        favDanmuList = Array.isArray(e.data.favList) ? e.data.favList : [];
    }
});

// 判断是否已收藏
function isMarked(uname, msg, price) {
    return favDanmuList.some(d =>
        d.uname === uname &&
        d.msg === msg &&
        (d.price || null) == (price || null)
    );
}

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
const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
const giftDetailBtn = document.getElementById('gift-detail-btn');

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
    popup.style.display = 'none';
    favListPopup.classList.toggle('open');
    if (favListPopup.classList.contains('open')) {
        renderFavList();
    }
    // === 新增：同步到所有同源窗口（包括OBS页面） ===
    window.postMessage({
        type: 'favListToggle',
        open: favListPopup.classList.contains('open')
    }, '*');
    // === 新增：同步收藏列表 ===
    window.postMessage({
        type: 'favListSync',
        favList: JSON.parse(localStorage.getItem('favDanmuList') || '[]')
    }, '*');
};

// =====================
// 主流程：登录、WebSocket、弹幕处理
// =====================
superchatBar.style.display = 'flex';
logoutBtn.style.display = 'none';

startBtn.onclick = async function() {
    // 关闭旧 ws
    if (ws) {
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        ws = null;
    }
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
    
    // 登录前清空所有区块，防止重复渲染
    danmuList.innerHTML = '';
    giftBar.innerHTML = '';
    superchatBar.innerHTML = '';
    superchatList = [];

    // UI切换
    loginWrap.style.display = 'none';
    mainArea.style.display = 'flex';
    danmuList.style.display = '';
    logoutBtn.style.display = '';
    authorInfo.style.display = 'none';
    giftDetailBtn.style.display = 'flex';
    
    // 设置并显示OBS页面地址输入框
    const obsUrlWrap = document.getElementById('obs-url-wrap');
    const obsUrlInput = document.getElementById('obs-url');
    if (obsUrlWrap && obsUrlInput) {
        obsUrlInput.value = location.origin + '/frontend/obs.html';
        obsUrlWrap.style.display = '';
        obsUrlInput.onclick = async function() {
            try {
                await navigator.clipboard.writeText(this.value);
                showObsCopyNotice('已复制到剪贴板');
            } catch (e) {
                showObsCopyNotice('复制失败，请手动复制');
            }
        };
    }

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

    //弹幕区插入房间号信息
    const roomInfoItem = document.createElement('div');
    roomInfoItem.className = 'danmu-item danmu-roomid-info';
    roomInfoItem.style.background = 'linear-gradient(90deg, #e3b7ff 0%, #b7eaff 100%)';
    roomInfoItem.style.color = '#1565c0';
    roomInfoItem.style.fontWeight = 'bold';
    roomInfoItem.style.fontSize = '18px';
    roomInfoItem.style.justifyContent = 'center';
    roomInfoItem.style.textAlign = 'center';
    roomInfoItem.style.margin = '18px 0 8px 0';
    roomInfoItem.textContent = `已登录房间号：${roomid}`;
    danmuList.appendChild(roomInfoItem);
    
    danmuList.scrollTop = danmuList.scrollHeight - danmuList.clientHeight;
    // 启动WebSocket
    ws = new WebSocket('ws://localhost:8765/');
    ws.onmessage = function(event) {
        handleWsMessage(event);
    };
};

// 通知框
function showObsCopyNotice(msg) {
    let notice = document.getElementById('obs-copy-notice');
    if (!notice) {
        notice = document.createElement('div');
        notice.id = 'obs-copy-notice';
        Object.assign(notice.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(183,234,255,0.9)',
            color: '#1565c0',
            fontWeight: 'bold',
            fontSize: '18px',
            padding: '16px 38px',
            borderRadius: '18px',
            boxShadow: '0 2px 16px #b7eaff55',
            zIndex: 5001,
            opacity: '0',
            transition: 'opacity 0.3s'
        });
        document.body.appendChild(notice);
    }
    notice.textContent = msg;
    notice.style.opacity = '1';
    clearTimeout(notice._timer);
    notice._timer = setTimeout(() => {
        notice.style.opacity = '0';
    }, 1500);
}

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
    item.dataset.fav = isMarked(data.uname, data.msg, data.price) ? "true" : "false"; // 关键
    item.onclick = function() {
        showDanmuPopup({
            type: 'superchat',
            price: data.price,
            uname: data.uname,
            msg: data.msg,
            origin: data.origin,
            marked: isMarked(data.uname, data.msg, data.price) // 关键
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
}

function handleDanmu(data, isAtBottom) {
    if (!data.uname) {
        // 如果没有uname，直接返回
        console.warn('Received invalid danmu data:', data);
        return;
    }
    
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
    item.dataset.fav = isMarked(data.uname, data.msg) ? "true" : "false";

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
            marked: isMarked(data.uname, data.msg) // 关键
        });
    };
    danmuList.appendChild(item);

    if (isAtBottom) {
        danmuList.scrollTop = danmuList.scrollHeight - danmuList.clientHeight;
        scrollBottomBtn.style.display = 'none';
    }
}

// =====================
// 退出登录
// =====================
logoutBtn.onclick = async function() {
    try {
        await fetch('/logout', {method: 'POST'});
    } catch (e) {
        // 可选：重试一次
        setTimeout(() => fetch('/logout', {method: 'POST'}), 500);
    }
    if (ws) {
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        ws = null;
    }
    danmuList.style.display = 'none';
    loginWrap.style.display = 'flex';
    mainArea.style.display = 'none';
    logoutBtn.style.display = 'none';
    danmuList.innerHTML = '';
    giftBar.innerHTML = '';
    popup.style.display = 'none';
    helpPopup.style.display = 'none';
    authorInfo.style.display = '';
    favListPopup.classList.remove('open'); // <-- 新增，确保弹窗状态重置
    giftDetailBtn.style.display = 'none';
    superchatList = [];

    const obsUrlWrap = document.getElementById('obs-url-wrap');
    if (obsUrlWrap) obsUrlWrap.style.display = 'none';
    
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
        document.documentElement.style.backgroundColor = 'transparent';
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
            document.documentElement.style.backgroundColor = 'transparent';
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
    document.documentElement.style.backgroundColor = 'transparent';
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
        // 通知礼物窗口
        if (window.giftWindow) {
            window.giftWindow.postMessage({type:'clearGift'}, '*');
        }
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
    if (e.data && e.data.type === 'refreshFavList') {
        // 重新从数据库拉取收藏列表并同步到所有页面
        fetch('/history').then(r=>r.json()).then(history=>{
            const favDanmuList = [
                ...(history.danmu||[]).filter(d=>d.fav),
                ...(history.superchat||[]).filter(d=>d.fav)
            ];
            localStorage.setItem('favDanmuList', JSON.stringify(favDanmuList));
            window.postMessage({
                type: 'favListSync',
                favList: favDanmuList
            }, '*');
            if (typeof renderFavList === 'function') renderFavList();
        });
    }
});

// 收藏弹幕时
window.postMessage({
    type: 'favListSync',
    favList: JSON.parse(localStorage.getItem('favDanmuList') || '[]')
}, '*');

// 取消收藏弹幕时同理

// 弹幕区滚动监听，控制按钮显示/隐藏
danmuList.addEventListener('scroll', function() {
    const threshold = 5;
    if (Math.abs(danmuList.scrollTop + danmuList.clientHeight - danmuList.scrollHeight) < threshold) {
        // 优雅隐藏：先淡出动画再隐藏
        if (scrollBottomBtn.style.display !== 'none') {
            scrollBottomBtn.style.animation = 'scrollBtnFloatOut 0.28s cubic-bezier(.42,0,.58,1.0)';
            setTimeout(() => {
                scrollBottomBtn.style.display = 'none';
                scrollBottomBtn.style.animation = '';
            }, 260);
        }
    } else {
        if (scrollBottomBtn.style.display !== 'flex') {
            scrollBottomBtn.style.display = 'flex';
            scrollBottomBtn.style.animation = 'scrollBtnFloatIn 0.38s cubic-bezier(.42,0,.58,1.0)';
        }
    }
});

// 按钮点击：滚动到底部
scrollBottomBtn.onclick = function() {
    danmuList.scrollTop = danmuList.scrollHeight - danmuList.clientHeight;
    // 优雅隐藏
    scrollBottomBtn.style.animation = 'scrollBtnFloatOut 0.28s cubic-bezier(.42,0,.58,1.0)';
    setTimeout(() => {
        scrollBottomBtn.style.display = 'none';
        scrollBottomBtn.style.animation = '';
    }, 260);
};

// 按钮点击：打开礼物详情窗口
giftDetailBtn.onclick = function() {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.show_gift_window) {
        window.pywebview.api.show_gift_window();
    }
};
