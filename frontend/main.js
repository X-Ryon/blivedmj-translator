import { addFavDanmu, renderFavList, showDanmuPopup } from './ui.js';

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

let ws = null;
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
let superchatList = []; // 记录所有醒目留言

// 收藏列表相关
const favListBtn = document.getElementById('fav-list-btn');
const favListPopup = document.getElementById('fav-list-popup');

favListBtn.onclick = function() {
    popup.style.display = 'none'; // 打开收藏列表时关闭原文弹窗
    if (favListPopup.style.display === 'flex') {
        favListPopup.style.display = 'none';
    } else {
        renderFavList();
        favListPopup.style.display = 'flex';
    }
};

// 页面初始化时
superchatBar.style.display = 'flex';
logoutBtn.style.display = 'none';

startBtn.onclick = async function() {
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
    if (!sessdata) sessdata = ""; // 默认空字符串
    // 发送参数到后端
    await fetch('/config', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({appid, secret, sessdata, roomid})
    });
    // 隐藏登录面板，显示弹幕区
    loginWrap.style.display = 'none';
    mainArea.style.display = 'flex'; // 显示主内容区
    danmuList.style.display = '';
    logoutBtn.style.display = '';
    roomidInfo.style.display = 'flex';
    roomidValue.textContent = roomid;
    roomidValue.title = roomid; // 鼠标悬停可见完整内容
    authorInfo.style.display = 'none'; // 隐藏作者栏
    // 启动WebSocket
    ws = new WebSocket('ws://localhost:8765/');
    ws.onmessage = function(event) {
        const threshold = 5;
        const isAtBottom = Math.abs(danmuList.scrollTop + danmuList.clientHeight - danmuList.scrollHeight) < threshold;

        const data = JSON.parse(event.data);

        // 醒目留言
        if (data.type === 'superchat') {
            // 1. 弹幕区显示
            const item = document.createElement('div');
            item.className = 'danmu-item danmu-superchat';
            item.innerHTML = `
              <div class="superchat-header">
                <span class="superchat-price">¥${data.price}</span>
                <span class="superchat-uname">${data.uname}</span>
              </div>
              <div class="superchat-msg">${data.msg}</div>
            `;
            // 新增：弹幕区醒目留言点击弹窗
            item.onclick = function() {
                showDanmuPopup({
                    type: 'superchat',
                    price: data.price,
                    uname: data.uname,
                    msg: data.msg,
                    origin: data.origin
                });
            };
            danmuList.appendChild(item);

            // 2. 上方栏记录
            superchatBar.style.display = 'flex';
            const scItem = document.createElement('div');
            scItem.className = 'superchat-item';
            scItem.innerHTML = `<span class="superchat-price">¥${data.price}</span> <span class="superchat-uname">${data.uname}</span>`;
            scItem.title = data.msg;
            // 记录原文和译文
            scItem.dataset.msg = data.msg;
            scItem.dataset.origin = data.origin;
            scItem.dataset.uname = data.uname;
            scItem.dataset.price = data.price;
            scItem.onclick = function() {
                showDanmuPopup({
                    type: 'superchat',
                    price: scItem.dataset.price,
                    uname: scItem.dataset.uname,
                    msg: scItem.dataset.msg,
                    origin: scItem.dataset.origin
                });
            };
            // 判断是否在最右侧
            const isAtRight = Math.abs(superchatBar.scrollLeft + superchatBar.clientWidth - superchatBar.scrollWidth) < 2;
            superchatBar.appendChild(scItem);
            if (isAtRight) {
                superchatBar.scrollLeft = superchatBar.scrollWidth;
            }
            superchatList.push(scItem);
            return;
        }

        // 礼物
        if (data.type === 'gift') {
            const item = document.createElement('div');
            item.className = 'gift-item';
            item.innerHTML = `
                <span class="gift-uname">${data.uname}</span>
                <span class="gift-name">${data.trans_name}</span>
                <span class="gift-num">x${data.num}</span>
            `;
            item.title = `¥ ${data.price} ${data.uname} 赠送 ${data.trans_name} x${data.num}`;
            // 新增：点击弹窗显示礼物原名
            item.onclick = function() {
                showDanmuPopup({
                    type: 'gift',
                    uname: data.uname,
                    msg: `${data.trans_name} x${data.num} ¥${data.price}`,
                    origin: `${data.gift_name} x${data.num} ¥${data.price}`,
                    price: data.price
                });
            };
            // 判断是否在最右侧
            const isAtRight = Math.abs(giftBar.scrollLeft + giftBar.clientWidth - giftBar.scrollWidth) < 2;
            giftBar.appendChild(item);
            if (isAtRight) {
                giftBar.scrollLeft = giftBar.scrollWidth;
            }
            return;
        }

        // 用量更新
        if (typeof data.char_count !== 'undefined') {
            usageCount.textContent = data.char_count;
            usageCount.title = data.char_count; // 鼠标悬停可见完整内容
        }
        const item = document.createElement('div');
        item.className = 'danmu-item';

        // 新增：根据身份设置 class
        let privilege = data.privilege || "白字"; // 后端需传递 privilege 字段
        if (privilege === "舰长") item.classList.add('danmu-jianzhang');
        else if (privilege === "提督") item.classList.add('danmu-tidu');
        else if (privilege === "总督") item.classList.add('danmu-zongdu');
        else if (privilege === "房管") item.classList.add('danmu-fangguan');
        else item.classList.add('danmu-normal'); // 白字

        // 新增：写入 dataset 字段，便于保存历史
        item.dataset.privilege = privilege;
        item.dataset.origin = data.origin || '';

        // 新弹幕动画：重置动画（兼容快速插入）
        item.style.animation = 'none';
        // 触发重绘
        void item.offsetWidth;
        item.style.animation = '';

        // 头像处理
        let avatarUrl = data.face || data.uface || '';
        if (!avatarUrl) {
            avatarUrl = 'https://static.hdslb.com/images/member/noface.gif';
        }
        const avatar = document.createElement('img');
        avatar.className = 'danmu-avatar';
        avatar.src = avatarUrl.replace(/^http:/, 'https:'); // 强制用 https
        avatar.alt = '头像';
        avatar.referrerPolicy = "no-referrer"; // 防止防盗链

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
                origin: data.origin // 如果有原文则支持切换
            });
        };
        danmuList.appendChild(item);

        if (isAtBottom) {
            danmuList.scrollTop = danmuList.scrollHeight - danmuList.clientHeight;
        }
    };
};

logoutBtn.onclick = async function() {
    await fetch('/logout', {method: 'POST'});
    danmuList.style.display = 'none';
    loginWrap.style.display = 'flex';
    mainArea.style.display = 'none'; // 隐藏主内容区
    logoutBtn.style.display = 'none';
    roomidInfo.style.display = 'none';
    danmuList.innerHTML = '';
    // 关闭弹窗
    popup.style.display = 'none';
    helpPopup.style.display = 'none';
    authorInfo.style.display = ''; // 显示作者栏
};

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
    if (event.target === popup) {
        popup.style.display = 'none';
    }
    if (event.target === helpPopup) {
        helpPopup.style.display = 'none';
    }
};

window.addEventListener('beforeunload', function() {

    navigator.sendBeacon('/shutdown');
});

// 更换背景功能
bgBtn.onclick = function() {
    bgFile.value = ''; // 重置，避免同一文件无法重复选择
    bgFile.click();
};

bgFile.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) {
        // 用户未选择文件时，自动恢复为 frontend/bg.png
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

// 可选：点击遮罩关闭
confirmBgModal.onclick = function(e) {
    if (e.target === confirmBgModal) {
        confirmBgModal.style.display = 'none';
    }
};

// 页面加载时自动恢复背景
window.addEventListener('DOMContentLoaded', function() {
    // 尝试加载bg.png
    const img = new Image();
    img.onload = function() {
        document.documentElement.style.backgroundImage = "url('/frontend/bg.png')";
    };
    img.onerror = function() {
        document.documentElement.style.backgroundImage = '';
    };
    img.src = '/frontend/bg.png';
});

function adjustDanmuPadding() {
    const authorInfo = document.getElementById('author-info');
    const danmuList = document.getElementById('danmu-list');
    if (authorInfo && danmuList) {
        const authorHeight = authorInfo.offsetHeight;
        danmuList.style.paddingBottom = (authorHeight + 24) + 'px'; // 额外多留24px
    }
}
window.addEventListener('DOMContentLoaded', adjustDanmuPadding);
window.addEventListener('resize', adjustDanmuPadding);

// 获取清屏相关元素
const clearBtn = document.getElementById('clear-btn');
const confirmClearModal = document.getElementById('confirm-clear-modal');
const confirmClearOk = document.getElementById('confirm-clear-ok');
const confirmClearCancel = document.getElementById('confirm-clear-cancel');
const clearDanmu = document.getElementById('clear-danmu');
const clearSuperchat = document.getElementById('clear-superchat');
const clearFav = document.getElementById('clear-fav');
const clearGift = document.getElementById('clear-gift');

// 点击清屏按钮弹窗
clearBtn.onclick = function() {
    // 默认只勾选弹幕区
    clearDanmu.checked = true;
    clearSuperchat.checked = false;
    clearFav.checked = false;
    clearGift.checked = false;
    confirmClearModal.style.display = 'flex';
};

// 确认清屏
confirmClearOk.onclick = function() {
    if (clearDanmu.checked) {
        danmuList.innerHTML = '';
    }
    if (clearSuperchat.checked) {
        superchatBar.innerHTML = '';
        if (typeof superchatList !== 'undefined') superchatList.length = 0;
    }
    if (clearGift.checked) {
        giftBar.innerHTML = '';
        // 通知礼物详情窗口也清空
        localStorage.setItem('clearGiftSignal', Date.now().toString());
    }
    if (clearFav.checked) {
        localStorage.removeItem('favDanmuList');
        renderFavList();
    }
    confirmClearModal.style.display = 'none';
};

// 取消清屏
confirmClearCancel.onclick = function() {
    confirmClearModal.style.display = 'none';
};

// 点击遮罩关闭弹窗
confirmClearModal.onclick = function(e) {
    if (e.target === confirmClearModal) {
        confirmClearModal.style.display = 'none';
    }
};