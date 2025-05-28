window.addEventListener('DOMContentLoaded', () => {
    // ====== DOM 元素获取 ======
    const danmuList = document.getElementById('danmu-list');
    const popup = document.getElementById('popup');
    const popupContent = document.getElementById('popup-content');
    const popupClose = document.getElementById('popup-close');
    const favPopup = document.getElementById('fav-list-popup');
    const favContent = document.getElementById('fav-list-content');
    const scrollBottomBtn = document.getElementById('scroll-bottom-btn');
    const fabWrap = document.getElementById('obs-fab-wrap');
    const fabMain = document.getElementById('obs-fab-main');
    const fabMenu = document.getElementById('obs-fab-menu');
    const fabTranslate = document.getElementById('obs-fab-translate');
    const fabFav = document.getElementById('obs-fab-fav');
    const fabClear = document.getElementById('obs-fab-clear');
    let favs = JSON.parse(localStorage.getItem('favDanmuList')||'[]');
    let obsTranslateEnabled = false;
    const obsTranslateImg = document.getElementById('obs-translate-img');

    // ====== 弹窗关闭 ======
    popupClose.onclick = ()=> popup.style.display = 'none';

    // ====== WebSocket 接收 ======
    const ws = new WebSocket('ws://localhost:8765/');
    ws.onmessage = e => {
        const d = JSON.parse(e.data);
        if (d.type==='superchat') return addSuperchat(d);
        if (d.type==='gift') return addGift(d);
        addDanmu(d);
    };

    // ====== 弹幕渲染 ======
    function isAtBottom() {
        const threshold = 5;
        return Math.abs(danmuList.scrollTop + danmuList.clientHeight - danmuList.scrollHeight) < threshold;
    }
    function addDanmu({uname, msg, origin, privilege, face, uface}) {
        const item = document.createElement('div');
        item.className = 'danmu-item';
        if (privilege === '舰长') item.classList.add('danmu-jianzhang');
        else if (privilege === '提督') item.classList.add('danmu-tidu');
        else if (privilege === '总督') item.classList.add('danmu-zongdu');
        else if (privilege === '房管') item.classList.add('danmu-fangguan');
        else item.classList.add('danmu-normal');
        let avatarUrl = face || uface || '';
        if (!avatarUrl) avatarUrl = 'https://static.hdslb.com/images/member/noface.gif';
        const img = document.createElement('img');
        img.src = avatarUrl.replace(/^http:/, 'https:');
        img.className = 'danmu-avatar';
        img.alt = '头像';
        img.referrerPolicy = "no-referrer";
        const txt = document.createElement('span');
        txt.textContent = `${uname}：${msg}`;
        item.append(img, txt);
        item.onclick = () => showPopup({ type: 'danmu', uname, msg, origin, marked: isFav(uname, msg) });

        // 判断是否在底部
        const atBottom = isAtBottom();
        danmuList.appendChild(item);
        if (atBottom) {
            // 延迟一帧再滚动，确保高度已更新
            requestAnimationFrame(() => {
                danmuList.scrollTop = danmuList.scrollHeight;
            });
        }
    }

    function addSuperchat({uname,price,msg,origin}) {
        const item = document.createElement('div');
        item.className='danmu-item danmu-superchat';
        item.innerHTML = `<div class="superchat-header"><span class="superchat-price">¥${price}</span><span class="superchat-uname">${uname}</span></div><div class="superchat-msg">${msg}</div>`;
        item.onclick = ()=> showPopup({type:'superchat',uname,msg,origin,price,marked:isFav(uname,msg,price)});
        const atBottom = isAtBottom();
        danmuList.appendChild(item);
        if (atBottom) {
            requestAnimationFrame(() => {
                danmuList.scrollTop = danmuList.scrollHeight;
            });
        }
    }

    function addGift({uname, trans_name, num, price, gift_name}) {
        const item = document.createElement('div');
        item.className = 'danmu-item danmu-gift';
        item.innerHTML = `
            <span class="gift-uname">${uname}</span>
            <span class="gift-name">${trans_name}</span>
            <span class="gift-num">x${num}</span>
            <span class="gift-price" style="color:#ff9800;margin-left:8px;">¥${price}</span>
        `;
        item.onclick = () => showPopup({
            type: 'gift',
            uname,
            msg: `${trans_name} x${num} ¥${price}`,
            origin: `${gift_name || trans_name} x${num} ¥${price}`,
            price,
            marked: false
        });
        const atBottom = isAtBottom();
        danmuList.appendChild(item);
        if (atBottom) {
            requestAnimationFrame(() => {
                danmuList.scrollTop = danmuList.scrollHeight;
            });
        }
    }

    // ====== 收藏相关 ======
    let latestFavList = []; // 存储后端最新收藏列表

    /**
     * 轮询后端收藏列表并刷新UI
     */
    async function pollObsFavList() {
        try {
            const history = await fetch('/history').then(r=>r.json());
            latestFavList = (history.danmu||[]).filter(d=>d.fav);
            renderFavs(latestFavList);
        } catch (e) {}
    }

    /**
     * 判断弹幕是否已收藏
     */
    function isFav(uname, msg, price) {
        return latestFavList.some(x => x.uname === uname && x.msg === msg && (x.price || null) == (price || null));
    }

    /**
     * 渲染收藏列表
     * @param {Array} favList
     */
    function renderFavs(favList) {
        if (!favContent) return;
        if (!Array.isArray(favList) || favList.length === 0) {
            favContent.innerHTML = '<div style="padding:12px;color:#888;text-align:center;">暂无收藏</div>';
            return;
        }
        favContent.innerHTML = favList.map((d, i) =>
            `<div class="danmu-item danmu-fav" style="margin:4px;padding:6px;cursor:pointer;" data-idx="${i}">
                ${d.uname}${d.price ? ' ¥'+d.price : ''}：${d.msg}
            </div>`
        ).join('');
        // 绑定弹窗
        Array.from(favContent.querySelectorAll('.danmu-item')).forEach((item, idx) => {
            item.onclick = () => showPopup({ ...favList[idx], marked: true });
        });
    }

    // ====== 弹窗 ======
    function showPopup(opts) {
        const {type, uname, msg, origin, price} = opts;
        let showingOrigin = false;
        let popupTitle = type === 'superchat' ? '醒目留言' : (type === 'gift' ? '赠送' : '弹幕');
        let priceLine = type === 'superchat'
            ? `<div style="font-size:16px;color:#b71c1c;margin-bottom:8px;">¥${price} ${uname}</div>`
            : `<div style="font-size:16px;color:#b71c1c;margin-bottom:8px;">${uname}</div>`;
        let msgLine = `<div id="superchat-popup-msg" style="font-size:15px;color:#555;">${msg}</div>`;
        let toggleBtn = (origin && origin !== msg)
            ? `<button id="toggle-origin-btn" style="margin-top:16px;padding:6px 18px;border-radius:8px;background:#ffd6e7;color:#b71c1c;border:none;font-weight:bold;cursor:pointer;height:36px;line-height:24px;">显示原文</button>`
            : '';

        // 实时判断是否已收藏
        let isMarked = isFav(uname, msg, price);
        let favBtn = '';
        if (type === 'gift') {
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

        if (origin && origin !== msg) {
            const toggleBtnElem = document.getElementById('toggle-origin-btn');
            const msgDiv = document.getElementById('superchat-popup-msg');
            toggleBtnElem && (toggleBtnElem.onclick = function() {
                if (!showingOrigin) {
                    msgDiv.textContent = origin;
                    toggleBtnElem.textContent = '显示翻译';
                    showingOrigin = true;
                } else {
                    msgDiv.textContent = msg;
                    toggleBtnElem.textContent = '显示原文';
                    showingOrigin = false;
                }
            });
        }

        // 收藏/取消收藏逻辑
        const favBtnElem = document.getElementById('fav-danmu-btn');
        if (favBtnElem && type !== 'gift') {
            favBtnElem.onclick = async function() {
                try {
                    await fetch('/set_fav', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            type, uname, origin: origin || msg, price: price || null, fav: isMarked ? 0 : 1
                        })
                    });
                    // 收藏状态变更后，立即刷新收藏列表和弹窗按钮
                    await pollObsFavList();
                    // 重新渲染弹窗（保持弹窗存在，按钮状态刷新）
                    showPopup({type, uname, msg, origin, price});
                } catch (e) {}
            };
        }
    }

    // ====== 收藏弹窗 ======
    fabFav.onclick = () => {
        favPopup.classList.add('show');
        pollObsFavList(); // 立即刷新一次
        fabMenu.classList.remove('show');
    };
    favPopup.onclick = e => {
        if (e.target === favPopup) favPopup.classList.remove('show');
    };

    // ====== 清屏按钮 ======
    fabClear.onclick = () => {
        danmuList.innerHTML = '';
        fabMenu.classList.remove('show');
    };

    // ====== 悬浮按钮浮现 ======
    document.addEventListener('mousemove', e => {
        const dist = Math.sqrt(e.clientX*e.clientX + e.clientY*e.clientY);
        if (dist < 120) fabMain.style.opacity = '1';
        else if (!fabMenu.classList.contains('show')) fabMain.style.opacity = '0';
    });
    fabMain.onclick = e => {
        fabMenu.classList.toggle('show');
        e.stopPropagation();
    };
    document.body.addEventListener('click', () => fabMenu.classList.remove('show'));

    // ====== 滚动条与按钮 ======
    danmuList.addEventListener('scroll', function() {
        const threshold = 5;
        if (Math.abs(danmuList.scrollTop + danmuList.clientHeight - danmuList.scrollHeight) < threshold) {
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
    scrollBottomBtn.onclick = function() {
        danmuList.scrollTop = danmuList.scrollHeight - danmuList.clientHeight;
        scrollBottomBtn.style.animation = 'scrollBtnFloatOut 0.28s cubic-bezier(.42,0,.58,1.0)';
        setTimeout(() => {
            scrollBottomBtn.style.display = 'none';
            scrollBottomBtn.style.animation = '';
        }, 260);
    };

    // ====== 翻译开关同步 ======
    function setObsTranslateEnabled(enabled) {
        obsTranslateEnabled = enabled;
        if (obsTranslateImg) obsTranslateImg.style.filter = enabled ? 'brightness(1)' : 'brightness(0.5)';
        showObsNotice(enabled ? '已启用翻译' : '已关闭翻译');
    }

    /**
     * 轮询后端翻译状态并同步UI
     */
    async function pollObsTranslateStatus() {
        try {
            const d = await fetch('/get_translate').then(r=>r.json());
            if (typeof d.enabled === 'boolean' && d.enabled !== obsTranslateEnabled) {
                setObsTranslateEnabled(d.enabled);
            }
        } catch (e) {}
    }

    // 悬浮按钮绑定
    if (fabTranslate) {
        fabTranslate.onclick = async () => {
            try {
                await fetch('/set_translate', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({enabled: !obsTranslateEnabled})
                });
                // 状态会在下次轮询时自动刷新
            } catch (e) {}
            fabMenu && fabMenu.classList.remove('show');
        };
    }

    // 初始化并定时轮询
    pollObsTranslateStatus();
    setInterval(pollObsTranslateStatus, 1000);

    // ====== 通知框 ======
    function showObsNotice(msg) {
        let notice = document.getElementById('obs-translate-notice');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'obs-translate-notice';
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
});