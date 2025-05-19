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
let superchatList = []; // 记录所有醒目留言

// 页面初始化时
superchatBar.style.display = 'flex';

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
            superchatBar.appendChild(scItem);
            superchatList.push(scItem);
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
    // ...其余不变...
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
    // 使用navigator.sendBeacon保证即使页面关闭也能发送
    navigator.sendBeacon('/shutdown');
});

// 更换背景功能
bgBtn.onclick = function() {
    bgFile.click();
};

bgFile.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    fetch('/upload_bg', {
        method: 'POST',
        body: formData
    }).then(res => {
        if (res.ok) {
            document.documentElement.style.backgroundImage = "url('/frontend/bg.png?ts=" + Date.now() + "')";
        } else {
            alert('上传失败');
        }
    });
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

/**
 * 通用弹窗显示函数
 * @param {Object} opts
 *   opts.type: 'superchat' | 'danmu'
 *   opts.price: 醒目留言价格（仅superchat）
 *   opts.uname: 用户名
 *   opts.msg: 显示内容（翻译或普通弹幕）
 *   opts.origin: 原文（可选）
 */
function showDanmuPopup(opts) {
    let showingOrigin = false;
    let popupTitle = opts.type === 'superchat' ? '醒目留言' : '弹幕';
    let priceLine = opts.type === 'superchat'
        ? `<div style="font-size:16px;color:#b71c1c;margin-bottom:8px;">¥${opts.price} ${opts.uname}</div>`
        : `<div style="font-size:16px;color:#b71c1c;margin-bottom:8px;">${opts.uname}</div>`;
    let msgLine = `<div id="superchat-popup-msg" style="font-size:15px;color:#555;">${opts.msg}</div>`;
    let toggleBtn = opts.origin
        ? `<button id="toggle-origin-btn" style="margin-top:16px;padding:6px 18px;border-radius:8px;background:#ffd6e7;color:#b71c1c;border:none;font-weight:bold;cursor:pointer;">显示原文</button>`
        : '';

    popupContent.innerHTML = `
        <div style="font-weight:bold;font-size:18px;margin-bottom:12px;">${popupTitle}</div>
        ${priceLine}
        ${msgLine}
        ${toggleBtn}
    `;
    popup.style.display = 'block';
    popup.style.position = 'fixed';
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.visibility = 'visible';

    if (opts.origin) {
        const toggleBtnElem = document.getElementById('toggle-origin-btn');
        const msgDiv = document.getElementById('superchat-popup-msg');
        toggleBtnElem.onclick = function() {
            if (!showingOrigin) {
                msgDiv.textContent = opts.origin;
                toggleBtnElem.textContent = '显示翻译';
                showingOrigin = true;
            } else {
                msgDiv.textContent = opts.msg;
                toggleBtnElem.textContent = '显示原文';
                showingOrigin = false;
            }
        };
    }
}

function showSuperchatPopup(scItem) {
    let showingOrigin = false;
    popupContent.innerHTML = `
        <div style="font-weight:bold;font-size:18px;margin-bottom:12px;">醒目留言</div>
        <div style="font-size:16px;color:#b71c1c;margin-bottom:8px;">¥${scItem.dataset.price} ${scItem.dataset.uname}</div>
        <div id="superchat-popup-msg" style="font-size:15px;color:#555;">${scItem.dataset.msg}</div>
        <button id="toggle-origin-btn" style="margin-top:16px;padding:6px 18px;border-radius:8px;background:#ffd6e7;color:#b71c1c;border:none;font-weight:bold;cursor:pointer;">显示原文</button>
    `;
    popup.style.display = 'block';
    popup.style.position = 'fixed';
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.visibility = 'visible';

    const toggleBtn = document.getElementById('toggle-origin-btn');
    const msgDiv = document.getElementById('superchat-popup-msg');
    toggleBtn.onclick = function() {
        if (!showingOrigin) {
            msgDiv.textContent = scItem.dataset.origin;
            toggleBtn.textContent = '显示翻译';
            showingOrigin = true;
        } else {
            msgDiv.textContent = scItem.dataset.msg;
            toggleBtn.textContent = '显示原文';
            showingOrigin = false;
        }
    };
}