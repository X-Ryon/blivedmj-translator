const danmuList = document.getElementById('danmu-list');
const popup = document.getElementById('popup');
const popupContent = document.getElementById('popup-content');
const popupClose = document.getElementById('popup-close');
const favPopup = document.getElementById('fav-list-popup');
const favContent = document.getElementById('fav-list-content');
let favs = JSON.parse(localStorage.getItem('favDanmuList')||'[]');

// 打开/关闭收藏列表
popupClose.onclick = ()=> popup.style.display = 'none';

// WebSocket 接收
const ws = new WebSocket('ws://localhost:8765/');
ws.onmessage = e => {
    const d = JSON.parse(e.data);
    if (d.type==='superchat') return addSuperchat(d);
    if (d.type==='gift') return addGift(d);
    addDanmu(d);
};

// 普通弹幕
function addDanmu({uname, msg, origin, privilege, face, uface}) {
    const item = document.createElement('div');
    item.className = 'danmu-item';
    // 根据权限加 class
    if (privilege === '舰长') item.classList.add('danmu-jianzhang');
    else if (privilege === '提督') item.classList.add('danmu-tidu');
    else if (privilege === '总督') item.classList.add('danmu-zongdu');
    else if (privilege === '房管') item.classList.add('danmu-fangguan');
    else item.classList.add('danmu-normal');
    // 头像处理
    let avatarUrl = face || uface || '';
    if (!avatarUrl) {
        avatarUrl = 'https://static.hdslb.com/images/member/noface.gif';
    }
    const img = document.createElement('img');
    img.src = avatarUrl.replace(/^http:/, 'https:');
    img.className = 'danmu-avatar';
    img.alt = '头像';
    img.referrerPolicy = "no-referrer";
    const txt = document.createElement('span');
    txt.textContent = `${uname}：${msg}`;
    item.append(img, txt);
    item.onclick = () => showPopup({ type: 'danmu', uname, msg, origin, marked: isFav(uname, msg) });
    danmuList.appendChild(item);
    danmuList.scrollTop = danmuList.scrollHeight;
}

// 醒目留言
function addSuperchat({uname,price,msg,origin}) {
    const item = document.createElement('div');
    item.className='danmu-item danmu-superchat';
    item.innerHTML = `<div class="superchat-header"><span class="superchat-price">¥${price}</span><span class="superchat-uname">${uname}</span></div><div class="superchat-msg">${msg}</div>`;
    item.onclick = ()=> showPopup({type:'superchat',uname,msg,origin,price,marked:isFav(uname,msg,price)});
    danmuList.appendChild(item);
    danmuList.scrollTop = danmuList.scrollHeight;
}

// 礼物
function addGift({uname,trans_name,num,price}) {
    const item = document.createElement('div');
    item.className='danmu-item danmu-gift';
    item.innerHTML = `<span class="gift-uname">${uname}</span><span class="gift-name">${trans_name}</span><span class="gift-num">x${num}</span>`;
    item.onclick = ()=> showPopup({type:'gift',uname,msg:trans_name,origin:trans_name,marked:false});
    danmuList.appendChild(item);
    danmuList.scrollTop = danmuList.scrollHeight;
}

function showPopup(opts) {
    const {type,uname,msg,origin,price,marked} = opts;
    let html = `<div style="font-weight:bold">${type==='superchat'?'醒目留言':type==='danmu'?'弹幕':'赠送'}</div>
        <div style="margin:8px 0;">${type==='superchat'?`¥${price} `:''}${uname}</div>
        <div id="popup-msg" style="color:#555;">${msg}</div>
        ${origin?'<button id="toggle-origin">显示原文</button>':''}
        <button id="fav-toggle" style="margin-left:10px;">${marked?'取消收藏':'收藏'}</button>`;
    popupContent.innerHTML = html;
    popup.style.display='block';
    // 切换原文
    const tog = document.getElementById('toggle-origin');
    if (tog) {
        let showOri=false;
        tog.onclick=()=>{
            document.getElementById('popup-msg').textContent = showOri?msg:origin;
            tog.textContent = showOri?'显示原文':'显示翻译';
            showOri=!showOri;
        };
    }
    // 收藏逻辑
    document.getElementById('fav-toggle').onclick = ()=>{
        const idx = favs.findIndex(x=>x.uname===uname&&x.msg===msg&&x.price==price);
        if (idx>=0) favs.splice(idx,1);
        else favs.push({type,uname,msg,origin,price});
        localStorage.setItem('favDanmuList',JSON.stringify(favs));
        popup.style.display='none';
    };
}

function isFav(uname,msg,price){
    return favs.some(x=>x.uname===uname&&x.msg===msg&&x.price==price);
}

function renderFavs(){
    favs = JSON.parse(localStorage.getItem('favDanmuList')||'[]');
    if (!favContent) return;
    favContent.innerHTML = favs.length
        ? favs.map((d, i) =>
            `<div class="danmu-item danmu-fav" style="margin:4px;padding:6px;cursor:pointer;" data-idx="${i}">
                ${d.uname}${d.price ? ' ¥'+d.price : ''}：${d.msg}
                <button class="fav-remove-btn" style="float:right;background:none;border:none;color:#ff90b3;font-size:18px;cursor:pointer;" title="取消标记">✖</button>
            </div>`
        ).join('')
        : '<div style="padding:12px;color:#888;text-align:center;">暂无收藏</div>';

    // 绑定弹窗和移除事件
    Array.from(favContent.querySelectorAll('.danmu-item')).forEach(item => {
        const idx = item.getAttribute('data-idx');
        if (idx !== null) {
            item.onclick = e => {
                if (e.target.classList.contains('fav-remove-btn')) {
                    favs.splice(idx, 1);
                    localStorage.setItem('favDanmuList', JSON.stringify(favs));
                    renderFavs();
                    e.stopPropagation();
                } else {
                    showPopup(favs[idx]);
                }
            };
        }
    });
}

// 监听主窗口消息，控制收藏弹窗显示/隐藏
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'favListToggle') {
        if (e.data.open) {
            favPopup.style.display = 'block';
            renderFavs();
        } else {
            favPopup.style.display = 'none';
        }
    }
});