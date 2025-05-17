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
const usageBox = document.getElementById('usage-box');
const usageCount = document.getElementById('usage-count');
const mainArea = document.getElementById('main-area');
const loginWrap = document.getElementById('login-wrap');

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
        // 用量更新
        if (typeof data.char_count !== 'undefined') {
            usageCount.textContent = data.char_count;
            usageCount.title = data.char_count; // 鼠标悬停可见完整内容
        }
        const item = document.createElement('div');
        item.className = 'danmu-item';

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
            // 弹窗标题为弹幕原文，内容为发送者+弹幕原文
            popupContent.innerHTML = `
                <div style="font-weight:bold;font-size:18px;margin-bottom:12px;">${"弹幕原文"}</div>
                <div style="font-size:15px;color:#555;">${data.uname}：${data.origin}</div>
            `;
            // 居中显示弹窗
            popup.style.display = 'block';
            popup.style.position = 'fixed';
            popup.style.left = '50%';
            popup.style.top = '50%';
            popup.style.transform = 'translate(-50%, -50%)';
            popup.style.visibility = 'visible';
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
window.addEventListener('resize', function() {
    if (window.innerWidth < 440) {
        window.resizeTo(440, window.innerHeight);
    }
    danmuList.style.height = Math.floor(window.innerHeight * 0.8) + 'px';
    danmuList.style.maxHeight = Math.floor(window.innerHeight * 0.8) + 'px';
});
danmuList.style.height = Math.floor(window.innerHeight * 0.8) + 'px';
danmuList.style.maxHeight = Math.floor(window.innerHeight * 0.8) + 'px';

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
            document.documentElement.style.backgroundImage = "url('/bg.png?ts=" + Date.now() + "')";
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
        document.documentElement.style.backgroundImage = "url('/bg.png')";
    };
    img.onerror = function() {
        document.documentElement.style.backgroundImage = '';
    };
    img.src = '/bg.png';
});