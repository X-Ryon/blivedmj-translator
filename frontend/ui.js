// 收藏弹幕功能
let favDanmuList = JSON.parse(localStorage.getItem('favDanmuList') || '[]');

export function addFavDanmu(danmu) {
    favDanmuList.push(danmu);
    localStorage.setItem('favDanmuList', JSON.stringify(favDanmuList));
}

export function renderFavList() {
    favDanmuList = JSON.parse(localStorage.getItem('favDanmuList') || '[]');
    const favListContent = document.getElementById('fav-list-content');
    favListContent.innerHTML = '';
    if (favDanmuList.length === 0) {
        favListContent.innerHTML = '<div style="color:#aaa;">暂无标记弹幕</div>';
        return;
    }
    favDanmuList.forEach((danmu, idx) => {
        const item = document.createElement('div');
        item.className = 'danmu-item danmu-fav';
        item.style.margin = '12px 0';
        item.innerHTML = `
            <span style="font-weight:bold;color:#b71c1c;">${danmu.uname}${danmu.price ? ' ¥'+danmu.price : ''}</span>
            <span style="margin-left:8px;color:#555;">${danmu.msg}</span>
            <button style="float:right;background:none;border:none;color:#ff90b3;font-size:18px;cursor:pointer;" title="取消标记" onclick="window.removeFavDanmu(${idx});event.stopPropagation();">✖</button>
        `;
        item.onclick = function() {
            showDanmuPopup(danmu);
        };
        favListContent.appendChild(item);
    });
}

window.removeFavDanmu = function(idx) {
    favDanmuList.splice(idx, 1);
    localStorage.setItem('favDanmuList', JSON.stringify(favDanmuList));
    renderFavList();
};

/**
 * 通用弹窗显示函数
 * @param {Object} opts
 *   opts.type: 'superchat' | 'danmu' | 'gift'
 *   opts.price: 醒目留言价格（仅superchat）
 *   opts.uname: 用户名
 *   opts.msg: 显示内容（翻译或普通弹幕）
 *   opts.origin: 原文（可选）
 */
export function showDanmuPopup(opts) {
    const popup = document.getElementById('popup');
    const popupContent = document.getElementById('popup-content');
    let showingOrigin = false;
    let popupTitle = '弹幕';
    if (opts.type === 'superchat') {
        popupTitle = '醒目留言';
    } else if (opts.type === 'gift') {
        popupTitle = '赠送';
    }
    let priceLine = opts.type === 'superchat'
        ? `<div style="font-size:16px;color:#b71c1c;margin-bottom:8px;">¥${opts.price} ${opts.uname}</div>`
        : `<div style="font-size:16px;color:#b71c1c;margin-bottom:8px;">${opts.uname}</div>`;
    let msgLine = `<div id="superchat-popup-msg" style="font-size:15px;color:#555;">${opts.msg}</div>`;
    let toggleBtn = opts.origin
        ? `<button id="toggle-origin-btn" style="margin-top:16px;padding:6px 18px;border-radius:8px;background:#ffd6e7;color:#b71c1c;border:none;font-weight:bold;cursor:pointer;height:36px;line-height:24px;">显示原文</button>`
        : '';
    // 如果是礼物，标记按钮禁用
    let favBtn = '';
    if (opts.type === 'gift') {
        favBtn = `<button id="fav-danmu-btn" disabled style="margin-top:16px;margin-left:10px;padding:6px 18px;border-radius:8px;background:#eee;color:#aaa;border:none;font-weight:bold;cursor:not-allowed;height:36px;line-height:24px;">标记</button>`;
    } else {
        favBtn = `<button id="fav-danmu-btn" title="标记弹幕" style="margin-top:16px;margin-left:10px;padding:6px 18px;border-radius:8px;background:#ffd6e7;color:#b71c1c;border:none;font-weight:bold;cursor:pointer;height:36px;line-height:24px;">标记</button>`;
    }

    popupContent.innerHTML = `
        <div style="font-weight:bold;font-size:18px;margin-bottom:12px;">${popupTitle}</div>
        ${priceLine}
        ${msgLine}
        <div style="display:flex;flex-direction:row;align-items:center;">
            ${toggleBtn}${favBtn}
        </div>
    `;
    popup.style.display = 'block';
    popup.style.position = 'fixed';
    popup.style.left = '50%';
    popup.style.top = '50%';
    popup.style.transform = 'translate(-50%, -50%)';
    popup.style.visibility = 'visible';
    popup.style.zIndex = 4000; // 保证顶层

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

    // 仅非礼物时绑定标记按钮逻辑
    if (opts.type !== 'gift') {
        document.getElementById('fav-danmu-btn').onclick = function() {
            addFavDanmu(opts); 
            this.disabled = true;
            this.textContent = '已标记';
            this.style.background = '#eee';
            this.style.color = '#aaa';
        };
    }
}