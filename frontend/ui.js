// =====================
// 收藏弹幕功能
// =====================
let favDanmuList = JSON.parse(localStorage.getItem('favDanmuList') || '[]');

/**
 * 添加收藏（后端成功后刷新列表）
 */
export async function addFavDanmu(danmu) {
    await fetch('/set_fav', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            type: danmu.type || (danmu.price ? 'superchat' : 'danmu'),
            uname: danmu.uname,
            origin: danmu.origin || danmu.msg,
            price: danmu.price || null,
            fav: 1
        })
    });
    await renderFavList();
}

/**
 * 移除收藏（后端成功后刷新列表）
 */
export async function removeFavDanmuByObj(danmu) {
    await fetch('/set_fav', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            type: danmu.type || (danmu.price ? 'superchat' : 'danmu'),
            uname: danmu.uname,
            origin: danmu.origin || danmu.msg,
            price: danmu.price || null,
            fav: 0
        })
    });
    await renderFavList();
}

/**
 * 渲染收藏列表
 */
export async function renderFavList() {
    const favListContent = document.getElementById('fav-list-content');
    favListContent.innerHTML = '<div style="color:#aaa;text-align:center;padding:32px 0;">加载中...</div>';
    try {
        const history = await fetch('/history').then(r=>r.json());
        const favDanmuList = [
            ...(history.danmu||[]).filter(d=>d.fav),
            ...(history.superchat||[]).filter(d=>d.fav)
        ];
        localStorage.setItem('favDanmuList', JSON.stringify(favDanmuList));
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
                <button style="float:right;background:none;border:none;color:#ff90b3;font-size:18px;cursor:pointer;" title="取消标记" data-idx="${idx}">✖</button>
            `;
            item.querySelector('button').onclick = async function(e) {
                e.stopPropagation();
                await removeFavDanmuByObj(danmu);
                // 若弹窗内容为当前项，刷新弹窗
                const popup = document.getElementById('popup');
                const popupContent = document.getElementById('popup-content');
                if (popup && popup.style.display === 'block' && popupContent) {
                    if (
                        popupContent.innerHTML.includes(danmu.uname) &&
                        popupContent.innerHTML.includes(danmu.msg)
                    ) {
                        showDanmuPopup({
                            ...danmu,
                            type: danmu.type || (danmu.price ? 'superchat' : 'danmu'),
                            price: danmu.price,
                            marked: false
                        });
                    }
                }
            };
            item.onclick = function() {
                showDanmuPopup({ 
                    ...danmu, 
                    type: danmu.type || (danmu.price ? 'superchat' : 'danmu'), 
                    price: danmu.price
                });
            };
            favListContent.appendChild(item);
        });
    } catch (e) {
        favListContent.innerHTML = '<div style="color:#aaa;text-align:center;padding:32px 0;">加载失败</div>';
    }
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
export async function showDanmuPopup(opts) {
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

    // 关键：弹窗弹出时实时拉取收藏状态
    let isMarked = false;
    try {
        const history = await fetch('/history').then(r=>r.json());
        const favDanmuList = [
            ...(history.danmu||[]).filter(d=>d.fav),
            ...(history.superchat||[]).filter(d=>d.fav)
        ];
        isMarked = favDanmuList.some(d =>
            d.uname === opts.uname &&
            d.msg === opts.msg &&
            (d.price || null) == (opts.price || null)
        );
    } catch (e) {}

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
        document.getElementById('fav-danmu-btn').onclick = async function() {
            if (isMarked) {
                await removeFavDanmuByObj(opts);
            } else {
                await addFavDanmu(opts);
            }
            // 操作后自动刷新弹窗按钮状态
            showDanmuPopup(opts);
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
    window.postMessage({
        type: 'favListSync',
        favList: favDanmuList
    }, '*');
    // 判断弹窗内容是否为当前被删除项，若是则刷新弹窗
    const popup = document.getElementById('popup');
    const popupContent = document.getElementById('popup-content');
    if (popup && popup.style.display === 'block' && popupContent) {
        // 简单判断：弹窗内容包含当前弹幕的uname和msg
        if (
            popupContent.innerHTML.includes(danmu.uname) &&
            popupContent.innerHTML.includes(danmu.msg)
        ) {
            // 重新弹出弹窗，marked: false
            showDanmuPopup({
                ...danmu,
                type: danmu.type || (danmu.price ? 'superchat' : 'danmu'),
                price: danmu.price,
                marked: false
            });
        }
    }
    // 通知主页面取消标记
    if (danmu) {
        window.postMessage({
            type: 'unmarkFav',
            uname: danmu.uname,
            msg: danmu.msg,
            price: danmu.price || null
        }, '*');
        fetch('/set_fav', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                type: danmu.type || (danmu.price ? 'superchat' : 'danmu'),
                uname: danmu.uname,
                origin: danmu.origin || danmu.msg,
                price: danmu.price || null,
                fav: 0
            })
        });
    }
};

let translateEnabled = false;

/**
 * 设置翻译开关状态（本地点击时调用）
 * @param {boolean} enabled
 */
export async function setTranslateEnabled(enabled) {
    translateEnabled = enabled;
    updateTranslateBtnUI(enabled);
    try {
        await fetch('/set_translate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({enabled})
        });
    } catch (e) {}
    showTranslateNotice(enabled ? '已启用翻译' : '已关闭翻译');
}

/**
 * 更新翻译按钮UI
 */
function updateTranslateBtnUI(enabled) {
    const img = document.getElementById('translate-toggle-img');
    if (img) img.style.filter = enabled ? 'brightness(1)' : 'brightness(0.5)';
}

/**
 * 轮询后端翻译状态并同步UI
 */
async function pollTranslateStatus() {
    try {
        const d = await fetch('/get_translate').then(r=>r.json());
        if (typeof d.enabled === 'boolean' && d.enabled !== translateEnabled) {
            translateEnabled = d.enabled;
            updateTranslateBtnUI(translateEnabled);
        }
    } catch (e) {}
}

/**
 * 显示翻译状态通知
 */
function showTranslateNotice(msg) {
    let notice = document.getElementById('translate-notice');
    if (!notice) {
        notice = document.createElement('div');
        notice.id = 'translate-notice';
        Object.assign(notice.style, {
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'rgba(183,234,255,0.7)',
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

// 初始化：按钮绑定和状态同步
window.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('translate-toggle-btn');
    if (btn) btn.onclick = () => setTranslateEnabled(!translateEnabled);
    // 初始化并定时轮询
    pollTranslateStatus();
    setInterval(pollTranslateStatus, 1000);
});

// 监听跨页面同步消息
window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'translate_toggle') {
        setTranslateEnabled(e.data.enabled, true);
    }
});

// 拦截弹幕弹窗，关闭翻译时只显示原文且无“显示原文”按钮
const origShowDanmuPopup = window.showDanmuPopup || showDanmuPopup;
window.showDanmuPopup = function(opts) {
    if (translateEnabled) {
        origShowDanmuPopup(opts);
    } else {
        // 只显示原文，无切换按钮
        const popup = document.getElementById('popup');
        const popupContent = document.getElementById('popup-content');
        let popupTitle = opts.type === 'superchat' ? '醒目留言' : (opts.type === 'gift' ? '赠送' : '弹幕');
        let priceLine = opts.type === 'superchat'
            ? `<div style="font-size:16px;color:#b71c1c;margin-bottom:8px;">¥${opts.price} ${opts.uname}</div>`
            : `<div style="font-size:16px;color:#b71c1c;margin-bottom:8px;">${opts.uname}</div>`;
        let msgLine = `<div id="superchat-popup-msg" style="font-size:15px;color:#555;">${opts.origin || opts.msg}</div>`;
        popupContent.innerHTML = `
            <div style="font-weight:bold;font-size:18px;margin-bottom:12px;">${popupTitle}</div>
            ${priceLine}
            ${msgLine}
        `;
        popup.style.display = 'block';
        popup.style.position = 'fixed';
        popup.style.left = '50%';
        popup.style.top = '50%';
        popup.style.transform = 'translate(-50%, -50%)';
        popup.style.visibility = 'visible';
        popup.style.zIndex = 4000;
    }
};

// 监听弹幕区刷新
window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'translate_toggle') {
        // 这里应触发弹幕区、sc区、gift区等刷新，只显示原文
        // 具体实现需结合你的 main.js 逻辑
        if (window.refreshDanmuList) window.refreshDanmuList();
        if (window.refreshSuperchatList) window.refreshSuperchatList();
        if (window.refreshGiftList) window.refreshGiftList();
    }
});