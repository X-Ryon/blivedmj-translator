# -*- coding: utf-8 -*-
import asyncio
import http.cookies
import random
import hashlib
import json
import os
import sys
import re
from typing import *

import aiohttp
import websockets
from aiohttp import web

import blivedm
import blivedm.models.web as web_models

# 在文件顶部定义
client = None

# 直播间ID的取值看直播间URL
TEST_ROOM_IDS = [
    162180,
]

CONFIG_FILE = 'config.json'
config = {}

session: Optional[aiohttp.ClientSession] = None

# 百度支持的语言代码（不含中文）
BAIDU_LANGS = [
    'en', 'yue', 'wyw', 'jp', 'kor', 'fra', 'spa', 'th', 'ara', 'ru', 'pt', 'de', 'it', 'el', 'nl', 'pl', 'bul',
    'est', 'dan', 'fin', 'cs', 'rom', 'slo', 'swe', 'hu', 'cht', 'vie'
]

ws_clients = set()

import threading
config_lock = threading.Lock()

# 加载历史字符数
def load_config():
    global config
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
                config.update(json.load(f))
        except Exception as e:
            print('配置文件损坏，使用默认配置', e)
            config.clear()
    # 设置默认值，防止KeyError
    config.setdefault('char_count', 0)
    config.setdefault('BAIDU_APPID', '')
    config.setdefault('BAIDU_SECRET', '')
    config.setdefault('SESSDATA', '')
    config.setdefault('ROOMID', '')
    config.setdefault('started', False)
    config.setdefault('win_width', 1000)
    config.setdefault('win_height', 1000)

def save_config():
    try:
        with config_lock:
            with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
                json.dump(config, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
    except Exception as e:
        print('保存配置失败:', e)

# 在程序启动时加载配置
load_config()

async def ws_handler(websocket, path):
    ws_clients.add(websocket)
    # 新连接时发送当前用量
    try:
        await websocket.send(json.dumps({'char_count': config.get('char_count', 0)}))
        async for _ in websocket:
            pass
    finally:
        ws_clients.remove(websocket)

async def baidu_translate(text, from_lang, to_lang):
    url = 'https://fanyi-api.baidu.com/api/trans/vip/translate'
    salt = str(random.randint(32768, 65536))
    sign = hashlib.md5((config['BAIDU_APPID'] + text + salt + config['BAIDU_SECRET']).encode('utf-8')).hexdigest()
    params = {
        'q': text,
        'from': from_lang,
        'to': to_lang,
        'appid': config['BAIDU_APPID'],
        'salt': salt,
        'sign': sign
    }
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params, timeout=8) as resp:
            data = await resp.json()
            if 'trans_result' in data:
                return data['trans_result'][0]['dst']
            else:
                print('[百度翻译失败]', data)
                return text

async def baidu_multi_translate(text, times=2):
    langs = BAIDU_LANGS.copy()
    result = text
    used_langs = []
    from_lang = 'zh'
    char_count = len(text)
    for i in range(times):
        if not langs:
            break
        lang = random.choice(langs)
        langs.remove(lang)
        try:
            result = await baidu_translate(result, from_lang, lang)
            used_langs.append(lang)
            # 翻译成功后累加字符数
            config['char_count'] = config.get('char_count', 0) + char_count
            save_config()
            print(f'[第{i+1}次翻译成功] -> {result} ({from_lang} -> {lang})')
            from_lang = lang
            await asyncio.sleep(0.5)  # 增加0.5秒延迟，防止QPS超限
        except Exception as e:
            print(f'[翻译失败] {e}')
            result = '[翻译请求失败] '+result  # 如果翻译失败，返回原文
            await asyncio.sleep(0.5)
            break
    # 最后翻译回中文
    try:
        result = await baidu_translate(result, from_lang, 'zh')
        # 翻译成功后累加字符数
        config['char_count'] = config.get('char_count', 0) + char_count
        save_config()
        print(f'[翻译回中文成功] -> {result} ({from_lang} -> zh)')
        await asyncio.sleep(0.5) # 增加0.5秒延迟，防止QPS超限
    except Exception as e:
        print(f'[翻译回中文失败] {e}')
        result = '[翻译请求失败] '+result  # 如果翻译失败，返回原文
        await asyncio.sleep(0.5)  
    
    return result

def remove_bili_emotes(text):
    # 移除所有形如 [xxx] 的内容
    return re.sub(r'\[[^\[\]]+\]', '', text).strip()

async def broadcast_danmaku(uname, msg, face=None, privilege="白字"):
    roomid = config.get('ROOMID', 0)
    if not roomid:
        return
    init_room_table(roomid)
    if ws_clients:
        clean_msg = remove_bili_emotes(msg)
        if not clean_msg:
            trans_msg = msg
        else:
            trans_msg = await baidu_multi_translate(clean_msg)
        # 保存到数据库
        insert_message(
            roomid=roomid,
            msg_type='danmu',
            uname=uname,
            privilege=privilege,
            origin=msg,
            trans=trans_msg,
            price=None,
            num=1,
            fav=0
        )
        data = json.dumps({
            'uname': uname,
            'msg': trans_msg,
            'origin': msg,
            'face': face or '',
            'char_count': config.get('char_count', 0),
            'privilege': privilege
        })
        await asyncio.gather(*(ws.send(data) for ws in ws_clients if ws.open))

async def broadcast_superchat(uname, price, origin_msg):
    roomid = config.get('ROOMID', 0)
    if not roomid:
        return
    init_room_table(roomid)
    if ws_clients:
        clean_msg = remove_bili_emotes(origin_msg)
        if not clean_msg:
            trans_msg = origin_msg
        else:
            trans_msg = await baidu_multi_translate(clean_msg)
        # 保存到数据库
        insert_message(
            roomid=roomid,
            msg_type='superchat',
            uname=uname,
            privilege='',
            origin=origin_msg,
            trans=trans_msg,
            price=price,
            num=1,
            fav=0
        )
        data = json.dumps({
            'type': 'superchat',
            'uname': uname,
            'price': price,
            'msg': trans_msg,
            'origin': origin_msg
        })
        await asyncio.gather(*(ws.send(data) for ws in ws_clients if ws.open))

async def broadcast_gift(uname, gift_name, num, total_coin):
    roomid = config.get('ROOMID', 0)
    if not roomid:
        return
    init_room_table(roomid)
    if ws_clients:
        trans_name = await baidu_multi_translate(gift_name)
        price = float(total_coin) / 1000
        # 保存到数据库
        insert_message(
            roomid=roomid,
            msg_type='gift',
            uname=uname,
            privilege='',
            origin=gift_name,
            trans=trans_name,
            price=price,
            num=num,
            fav=0
        )
        data = json.dumps({
            'type': 'gift',
            'uname': uname,
            'gift_name': gift_name,
            'trans_name': trans_name,
            'num': num,
            'price': price
        })
        await asyncio.gather(*(ws.send(data) for ws in ws_clients if ws.open))

async def start_danmu_and_ws():
    global client
    init_session()
    # 确保WebSocket服务只启动一次
    if not hasattr(start_danmu_and_ws, "ws_server"):
        start_danmu_and_ws.ws_server = await websockets.serve(ws_handler, '0.0.0.0', 8765, ping_interval=None)
    while True:
        try:
            room_id = int(config.get('ROOMID', 0))
            if not room_id:
                print("未设置房间号")
                await asyncio.sleep(2)
                continue
            # 创建 client 实例
            client = blivedm.BLiveClient(room_id, session=session)
            handler = MyHandler()
            client.set_handler(handler)
            print(f"尝试连接房间 {room_id} ...")
            client.start()
            await client.join()
        except blivedm.clients.ws_base.InitError as e:
            print(f"[重试] 连接直播间失败: {e}，2秒后重试")
            await asyncio.sleep(2)
        except Exception as e:
            print(f"[错误] 弹幕监听异常: {e}，2秒后重试")
            await asyncio.sleep(2)

async def config_handler(request):
    global client
    data = await request.json()
    config['BAIDU_APPID'] = data['appid']
    config['BAIDU_SECRET'] = data['secret']
    config['SESSDATA'] = data['sessdata']
    config['ROOMID'] = data['roomid']  # 保存房间号
    save_config()  # 保存到文件
    # 启动弹幕监听和WebSocket服务（只启动一次）
    if not config.get('started') or not (client and client.is_running):
        asyncio.create_task(start_danmu_and_ws())
        config['started'] = True
    return web.Response(text='ok')

async def config_get_handler(request):
    return web.json_response({
        'appid': config.get('BAIDU_APPID', ''),
        'secret': config.get('BAIDU_SECRET', ''),
        'sessdata': config.get('SESSDATA', ''),
        'roomid': config.get('ROOMID', '')
    })

def init_session():
    cookies = http.cookies.SimpleCookie()
    cookies['SESSDATA'] = config['SESSDATA']
    cookies['SESSDATA']['domain'] = 'bilibili.com'

    global session
    session = aiohttp.ClientSession()
    session.cookie_jar.update_cookies(cookies)

class MyHandler(blivedm.BaseHandler):
    # # 演示如何添加自定义回调
    # _CMD_CALLBACK_DICT = blivedm.BaseHandler._CMD_CALLBACK_DICT.copy()
    #
    # # 看过数消息回调
    # def __watched_change_callback(self, client: blivedm.BLiveClient, command: dict):
    #     print(f'[{client.room_id}] WATCHED_CHANGE: {command}')
    # _CMD_CALLBACK_DICT['WATCHED_CHANGE'] = __watched_change_callback  # noqa

    def _on_heartbeat(self, client: blivedm.BLiveClient, message: web_models.HeartbeatMessage):
        print(f'[{client.room_id}] 心跳')

    def _on_danmaku(self, client: blivedm.BLiveClient, message: web_models.DanmakuMessage):
        privilege_map = {1: "总督", 2: "提督", 3: "舰长"}
        privilege = privilege_map.get(message.privilege_type, "白字")
        if message.admin:
            privilege = "房管"
        print(f'[{client.room_id}] {message.uname}({privilege})：{message.msg}')
        asyncio.create_task(broadcast_danmaku(message.uname, message.msg, getattr(message, "face", ""), privilege))
        # asyncio.create_task(broadcast_superchat(message.uname+"12312312312312312312", 30, message.msg))//测试用

    def _on_gift(self, client: blivedm.BLiveClient, message: web_models.GiftMessage):
        print(f'[{client.room_id}] {message.uname} 赠送{message.gift_name}x{message.num}'
              f' （{message.coin_type}瓜子x{message.total_coin}）')
        if message.coin_type == 'gold':
            asyncio.create_task(broadcast_gift(message.uname, message.gift_name, message.num, message.total_coin))

    def _on_user_toast_v2(self, client: blivedm.BLiveClient, message: web_models.UserToastV2Message):
        print(f'[{client.room_id}] {message.username} 上舰，guard_level={message.guard_level}')

    def _on_super_chat(self, client: blivedm.BLiveClient, message: web_models.SuperChatMessage):
        print(f'[{client.room_id}] 醒目留言 ¥{message.price} {message.uname}：{message.message}')
        asyncio.create_task(
            broadcast_superchat(message.uname, message.price, message.message)
        )

# 在此处添加app定义和路由注册
app = web.Application()
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
app.router.add_get('/config', config_get_handler)
app.router.add_post('/config', config_handler)
STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend')
app.router.add_static('/frontend/', STATIC_DIR, show_index=True)

import os, base64

HISTORY_FILE = os.path.join(STATIC_DIR, 'danmu_history.bin')

async def save_history_handler(request):
    data = await request.json()
    b64 = data.get('b64', '')
    if b64:
        with open(HISTORY_FILE, 'wb') as f:
            f.write(base64.b64decode(b64))
        return web.Response(text='ok')
    return web.Response(text='fail', status=400)

async def load_history_handler(request):
    if not os.path.exists(HISTORY_FILE):
        return web.json_response({'b64': ''})
    with open(HISTORY_FILE, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode('ascii')
    return web.json_response({'b64': b64})

app.router.add_post('/save_history', save_history_handler)
app.router.add_get('/load_history', load_history_handler)

async def shutdown_handler(request):
    print("收到关闭请求，准备退出后端进程")
    save_config()  # 退出时保存用量
    import threading, time
    def delayed_exit():
        time.sleep(0.5)
        os._exit(0)  # 强制整个进程退出，兼容多线程
    threading.Thread(target=delayed_exit, daemon=True).start()
    return web.Response(text='ok')

async def logout_handler(request):
    global client
    print("收到退出登录请求，停止弹幕接收")
    if client and client.is_running:
        await client.stop_and_close()
        client = None
    config['started'] = False   # 允许下次重新启动监听
    save_config()  # 退出时保存用量
    return web.Response(text='ok')

async def upload_bg_handler(request):
    reader = await request.multipart()
    field = await reader.next()
    if field.name != 'file':
        return web.Response(text='No file', status=400)
    filename = os.path.join(STATIC_DIR,'frontend', 'bg.png')
    with open(filename, 'wb') as f:
        while True:
            chunk = await field.read_chunk()
            if not chunk:
                break
            f.write(chunk)
    return web.Response(text='ok')

async def remove_fav_handler(request):
    data = await request.json()
    uname = data.get('uname')
    msg = data.get('msg')
    price = data.get('price')
    roomid = config.get('ROOMID')
    if not roomid:
        return web.json_response({'ok': False})
    table = get_table_name(roomid)
    import sqlite3
    with sqlite3.connect(DB_PATH) as conn:
        # 只要 uname 和 trans 或 origin 匹配即可
        conn.execute(
            f"UPDATE {table} SET fav=0 WHERE uname=? AND (trans=? OR origin=?) AND (price=? OR price IS NULL)",
            (uname, msg, msg, price)
        )
        conn.commit()
    return web.json_response({'ok': True})
    
async def history_handler(request):
    roomid = config.get('ROOMID')
    if not roomid:
        return web.json_response({'danmu': [], 'gift': []})
    table = get_table_name(roomid)
    danmu = []
    gift = []
    sc = []
    try:
        with sqlite3.connect(DB_PATH) as conn:
            # 只取最近100条弹幕
            for row in conn.execute(f"SELECT * FROM {table} WHERE type='danmu' ORDER BY id DESC LIMIT 100"):
                danmu.append({
                    'uname': row[3],
                    'msg': row[6],      # trans
                    'origin': row[5],   # origin
                    'privilege': row[4],
                    'face': '',
                    'fav': row[9],
                })
            # 只取最近80条礼物
            for row in conn.execute(f"SELECT * FROM {table} WHERE type='gift' ORDER BY id DESC LIMIT 80"):
                gift.append({
                    'uname': row[3],
                    'gift_name': row[5],    # origin
                    'trans_name': row[6],   # trans
                    'num': row[8],
                    'price': row[7],
                })
            # 只取最近50条醒目留言
            for row in conn.execute(f"SELECT * FROM {table} WHERE type='superchat' ORDER BY id DESC LIMIT 50"):
                sc.append({
                    'uname': row[3],
                    'msg': row[6],      # trans
                    'origin': row[5],   # origin
                    'privilege': row[4],
                    'price': row[7],
                    'fav': row[9],
                })
            
    except Exception as e:
        print('历史数据查询失败:', e)
    return web.json_response({'danmu': danmu[::-1], 'gift': gift[::-1]})  # 正序

async def clear_history_handler(request):
    roomid = config.get('ROOMID')
    if not roomid:
        return web.json_response({'ok': False})
    table = get_table_name(roomid)
    import sqlite3
    try:
        data = await request.json()
        types = data.get('types', [])
    except Exception:
        types = []
    with sqlite3.connect(DB_PATH) as conn:
        if not types or set(types) == {'danmu', 'superchat', 'gift', 'fav'}:
            conn.execute(f"DELETE FROM {table}")
        else:
            if 'danmu' in types:
                conn.execute(f"DELETE FROM {table} WHERE type='danmu'")
            if 'superchat' in types:
                conn.execute(f"DELETE FROM {table} WHERE type='superchat'")
            if 'gift' in types:
                conn.execute(f"DELETE FROM {table} WHERE type='gift'")
            if 'fav' in types:
                conn.execute(f"UPDATE {table} SET fav=0 WHERE fav=1")
        conn.commit()
    return web.json_response({'ok': True})


# 注册路由
app.router.add_post('/shutdown', shutdown_handler)
app.router.add_get('/shutdown', shutdown_handler)
app.router.add_post('/logout', logout_handler)
app.router.add_post('/upload_bg', upload_bg_handler)
app.router.add_post('/remove_fav', remove_fav_handler)
app.router.add_get('/history', history_handler)
app.router.add_post('/clear_history', clear_history_handler)


import sqlite3
import time

DB_PATH = os.path.join(os.path.dirname(__file__), 'danmuji.db')

def get_table_name(roomid):
    return f'danmu_{roomid}'

def init_room_table(roomid):
    table = get_table_name(roomid)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(f'''
            CREATE TABLE IF NOT EXISTS {table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts INTEGER,
                type TEXT,
                uname TEXT,
                privilege TEXT,
                origin TEXT,
                trans TEXT,
                price REAL,
                num INTEGER,
                fav INTEGER DEFAULT 0
            )
        ''')
        conn.commit()

def insert_message(roomid, msg_type, uname, privilege, origin, trans, price=None, num=1, fav=0):
    table = get_table_name(roomid)
    ts = int(time.time())
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            f'''INSERT INTO {table} (ts, type, uname, privilege, origin, trans, price, num, fav)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (ts, msg_type, uname, privilege, origin, trans, price, num, fav)
        )
        conn.commit()

def update_fav(roomid, msg_type, uname, origin, fav):
    table = get_table_name(roomid)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            f'''UPDATE {table} SET fav=? WHERE type=? AND uname=? AND origin=?''',
            (fav, msg_type, uname, origin)
        )
        conn.commit()

async def set_fav_handler(request):
    data = await request.json()
    # 直接从后端配置获取当前房间号
    roomid = config.get('ROOMID')
    msg_type = data.get('type')
    uname = data.get('uname')
    origin = data.get('origin')
    fav = int(data.get('fav', 0))
    # 可选：price 字段
    update_fav(roomid, msg_type, uname, origin, fav)
    return web.Response(text='ok')

app.router.add_post('/set_fav', set_fav_handler)

if __name__ == '__main__':
    import threading
    import webview
    import traceback

    def start_server():
        try:
            import asyncio
            from aiohttp import web
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            web.run_app(app, port=8080)
        except Exception as e:
            with open('error.log', 'w', encoding='utf-8') as f:
                f.write('start_server error:\n')
                f.write(traceback.format_exc())
            raise

    try:
        t = threading.Thread(target=start_server, daemon=True)
        t.start()

        import time, socket
        for _ in range(30):
            try:
                with socket.create_connection(('127.0.0.1', 8080), timeout=0.5):
                    break
            except Exception:
                time.sleep(0.2)
        else:
            raise RuntimeError('后端服务未能在预期时间内启动')

        # 强制类型转换，防止类型错误
        win_width = int(float(config.get('win_width', 1000)))
        win_height = int(float(config.get('win_height', 1000)))

        window = webview.create_window(
            '弹幕姬-但是人工智障翻译版',
            'http://localhost:8080/frontend/app.html',
            width=win_width,
            height=win_height,
            min_size=(450, 450),
            resizable=True,
            frameless=False,
            confirm_close=True,
        )

        gift_window = webview.create_window(
            '礼物详情',
            'http://localhost:8080/frontend/gift.html',
            width=450,
            height=win_height,
            min_size=(200, 200),
            resizable=True,
            confirm_close=True,
            hidden=True,
        )

        def on_window_resized():
            try:
                w = int(window.width)
                h = int(window.height)
                if w > 100 and h > 100:
                    config['win_width'] = w
                    config['win_height'] = h
                save_config()
            except Exception as e:
                with open('error.log', 'a', encoding='utf-8') as f:
                    f.write('on_window_resized error:\n')
                    import traceback
                    f.write(traceback.format_exc())

        def on_window_closing():
            try:
                save_config()
                return True
            except Exception as e:
                with open('error.log', 'a', encoding='utf-8') as f:
                    f.write('on_window_closing error:\n')
                    import traceback
                    f.write(traceback.format_exc())
                return True

        window.events.resized += on_window_resized
        window.events.closing += on_window_closing

        def on_gift_window_closing():
            return False  # 阻止关闭

        gift_window.events.closing += on_gift_window_closing

        # 启动后定位礼物窗口
        def set_gift_window_position():
            try:
                # 获取主窗口位置和尺寸
                x = window.x
                y = window.y
                w = window.width
                h = window.height
                # 设置礼物窗口位置在主窗口右侧，高度与主窗口相同
                gift_window.move(x + w + 10, y)  # 右侧间隔10像素
                gift_window.resize(gift_window.width, h)
                gift_window.show()
            except Exception as e:
                with open('error.log', 'a', encoding='utf-8') as f:
                    f.write('set_gift_window_position error:\n')
                    import traceback
                    f.write(traceback.format_exc())

        webview.start(set_gift_window_position, debug=True)
    except Exception as e:
        with open('error.log', 'w', encoding='utf-8') as f:
            f.write('main error:\n')
            f.write(traceback.format_exc())
        raise
