
// =====================
// 收藏弹幕功能
// =====================
let favDanmuList = JSON.parse(localStorage.getItem('favDanmuList') || '[]');

/**
 * 添加弹幕到收藏列表
 * @param {Object} danmu
 */
export function addFavDanmu(danmu) {
    favDanmuList.push(danmu);
    localStorage.setItem('favDanmuList', JSON.stringify(favDanmuList));
}

/**
 * 渲染收藏列表
 */
export function renderFavList() {
    favDanmuList = JSON.parse(localStorage.getItem('favDanmuList') || '[]');
    const favListContent = document.getElementById('fav-list-content');
    favListContent.innerHTML = '';
    if (favDanmuList.length === 0) {
        favListContent.innerHTML = '<div style="color:#aaa;text-align:center;padding:32px 0;">暂无标记弹幕</div>';
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
            showDanmuPopup({ ...danmu, marked: true });
        };
        favListContent.appendChild(item);
    });
}

/**
 * 查找收藏索引
 * @param {Object} danmu
 * @returns {number}
 */
function findFavIndex(danmu) {
    return favDanmuList.findIndex(item =>
        item.uname === danmu.uname &&
        item.msg === danmu.msg &&
        (item.price || null) == (danmu.price || null)
    );
}

function syncFavToBackend({type, uname, origin, price, fav}) {
    fetch('/set_fav', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            type, uname, origin, price, fav
        })
    });
}

// =====================
// 弹幕弹窗与收藏按钮逻辑
// =====================
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
    // 判断是否已收藏
    let isMarked = opts.marked || false;
    let favBtn = '';
    if (opts.type === 'gift') {
        favBtn = `<button id="fav-danmu-btn" disabled style="margin-top:16px;margin-left:10px;padding:6px 18px;border-radius:8px;background:#eee;color:#aaa;border:none;font-weight:bold;cursor:not-allowed;height:36px;line-height:24px;">标记</button>`;
    } else if (isMarked) {
        favBtn = `<button id="fav-danmu-btn" style="margin-top:16px;margin-left:10px;padding:6px 18px;border-radius:8px;background:#eee;color:#b71c1c;border:none;font-weight:bold;cursor:pointer;height:36px;line-height:24px;">取消标记</button>`;
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
    popup.style.zIndex = 4000;

    if (opts.origin) {
        const toggleBtnElem = document.getElementById('toggle-origin-btn');
        const msgDiv = document.getElementById('superchat-popup-msg');
        toggleBtnElem && (toggleBtnElem.onclick = function() {
            if (!showingOrigin) {
                msgDiv.textContent = opts.origin;
                toggleBtnElem.textContent = '显示翻译';
                showingOrigin = true;
            } else {
                msgDiv.textContent = opts.msg;
                toggleBtnElem.textContent = '显示原文';
                showingOrigin = false;
            }
        });
    }

    // 收藏/取消收藏逻辑
    if (opts.type !== 'gift') {
        document.getElementById('fav-danmu-btn').onclick = function() {
            if (isMarked) {
                // 取消收藏
                const idx = findFavIndex(opts);
                if (idx !== -1) {
                    favDanmuList.splice(idx, 1);
                    localStorage.setItem('favDanmuList', JSON.stringify(favDanmuList));
                    // 通知主页面取消标记
                    window.postMessage({
                        type: 'unmarkFav',
                        uname: opts.uname,
                        msg: opts.msg,
                        price: opts.price || null
                    }, '*');
                    // 刷新收藏列表
                    const favListPopup = document.getElementById('fav-list-popup');
                    if (favListPopup && favListPopup.style.display === 'flex') {
                        renderFavList();
                    }
                    // 按钮变为可收藏
                    this.disabled = false;
                    this.textContent = '标记';
                    this.style.background = '#ffd6e7';
                    this.style.color = '#b71c1c';
                    isMarked = false;
                    // 同步到后端
                    syncFavToBackend({
                        type: opts.type,
                        uname: opts.uname,
                        origin: opts.origin || opts.msg,
                        price: opts.price || null,
                        fav: 0
                    });
                }
            } else {
                // 添加收藏
                addFavDanmu(opts);
                this.disabled = false;
                this.textContent = '取消标记';
                this.style.background = '#eee';
                this.style.color = '#b71c1c';
                isMarked = true;
                // 通知主页面标记已收藏
                window.postMessage({
                    type: 'markFav',
                    uname: opts.uname,
                    msg: opts.msg,
                    price: opts.price || null
                }, '*');
                // 同步收藏到后端
                syncFavToBackend({
                    type: opts.type,
                    uname: opts.uname,
                    origin: opts.origin || opts.msg,
                    price: opts.price || null,
                    fav: 1
                });
                // 刷新收藏列表
                const favListPopup = document.getElementById('fav-list-popup');
                if (favListPopup && favListPopup.style.display === 'flex') {
                    renderFavList();
                }
            }
        };
    }
}

// =====================
// 收藏列表移除逻辑，通知主页面同步
// =====================
window.removeFavDanmu = function(idx) {
    const danmu = favDanmuList[idx];
    favDanmuList.splice(idx, 1);
    localStorage.setItem('favDanmuList', JSON.stringify(favDanmuList));
    renderFavList();
    const popup = document.getElementById('popup');
    if (popup && popup.style.display === 'block') {
        popup.style.display = 'none';
    }
    // 通知主页面取消标记
    if (danmu) {
        window.postMessage({
            type: 'unmarkFav',
            uname: danmu.uname,
            msg: danmu.msg,
            price: danmu.price || null
        }, '*');
        // 同步到后端数据库
        fetch('/remove_fav', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                uname: danmu.uname,
                msg: danmu.msg,
                price: danmu.price || null
            })
        });
    }
};
