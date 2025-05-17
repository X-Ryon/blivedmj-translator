# -*- coding: utf-8 -*-
import asyncio
import http.cookies
import random
import hashlib
import json
import os
import sys
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

# 加载历史字符数
def load_config():
    global config
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            config.update(json.load(f))
    if 'char_count' not in config:
        config['char_count'] = 0

def save_config():
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)

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

async def baidu_multi_translate(text, times=3):
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

async def broadcast_danmaku(uname, msg, face=None):
    # print(f'[DEBUG] 发送弹幕：{uname}，face={face}')  # 新增调试
    if ws_clients:
        trans_msg = await baidu_multi_translate(msg)
        data = json.dumps({
            'uname': uname,
            'msg': trans_msg,
            'origin': msg,
            'face': face or '',
            'char_count': config.get('char_count', 0)  # 新增
        })
        await asyncio.gather(*(ws.send(data) for ws in ws_clients if ws.open))

async def start_danmu_and_ws():
    global client
    init_session()
    ws_server = await websockets.serve(ws_handler, '0.0.0.0', 8765, ping_interval=None)
    try:
        room_id = int(config.get('ROOMID', 0))
        if not room_id:
            print("未设置房间号")
            return
        # 创建 client 实例
        client = blivedm.BLiveClient(room_id, session=session)
        handler = MyHandler()
        client.set_handler(handler)
        client.start()
        await client.join()
    finally:
        ws_server.close()
        await ws_server.wait_closed()

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

async def run_single_client():
    """
    演示监听一个直播间
    """
    room_id = random.choice(TEST_ROOM_IDS)
    client = blivedm.BLiveClient(room_id, session=session)
    handler = MyHandler()
    client.set_handler(handler)

    client.start()
    try:
        # 演示5秒后停止
        # await asyncio.sleep(5)
        # client.stop()

        await client.join()
    finally:
        await client.stop_and_close()

async def run_multi_clients():
    """
    演示同时监听多个直播间
    """
    clients = [blivedm.BLiveClient(room_id, session=session) for room_id in TEST_ROOM_IDS]
    handler = MyHandler()
    for client in clients:
        client.set_handler(handler)
        client.start()

    try:
        await asyncio.gather(*(
            client.join() for client in clients
        ))
    finally:
        await asyncio.gather(*(
            client.stop_and_close() for client in clients
        ))

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
        print(f'[{client.room_id}] {message.uname}：{message.msg}')
        asyncio.create_task(broadcast_danmaku(message.uname, message.msg, getattr(message, "face", "")))

    def _on_gift(self, client: blivedm.BLiveClient, message: web_models.GiftMessage):
        print(f'[{client.room_id}] {message.uname} 赠送{message.gift_name}x{message.num}'
              f' （{message.coin_type}瓜子x{message.total_coin}）')

    # def _on_buy_guard(self, client: blivedm.BLiveClient, message: web_models.GuardBuyMessage):
    #     print(f'[{client.room_id}] {message.username} 上舰，guard_level={message.guard_level}')

    def _on_user_toast_v2(self, client: blivedm.BLiveClient, message: web_models.UserToastV2Message):
        print(f'[{client.room_id}] {message.username} 上舰，guard_level={message.guard_level}')

    def _on_super_chat(self, client: blivedm.BLiveClient, message: web_models.SuperChatMessage):
        print(f'[{client.room_id}] 醒目留言 ¥{message.price} {message.uname}：{message.message}')

    # def _on_interact_word(self, client: blivedm.BLiveClient, message: web_models.InteractWordMessage):
    #     if message.msg_type == 1:
    #         print(f'[{client.room_id}] {message.username} 进入房间')

# 在此处添加app定义和路由注册
app = web.Application()
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))
print(STATIC_DIR)
app.router.add_get('/config', config_get_handler)
app.router.add_post('/config', config_handler)
app.router.add_static('/', STATIC_DIR, show_index=True)

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
    filename = os.path.join(STATIC_DIR, 'bg.png')
    with open(filename, 'wb') as f:
        while True:
            chunk = await field.read_chunk()
            if not chunk:
                break
            f.write(chunk)
    return web.Response(text='ok')

# 注册路由
app.router.add_post('/shutdown', shutdown_handler)
app.router.add_get('/shutdown', shutdown_handler)
app.router.add_post('/logout', logout_handler)
app.router.add_post('/upload_bg', upload_bg_handler)

import webbrowser

if __name__ == '__main__':
    import threading
    import webview

    def start_server():
        # aiohttp 默认阻塞，需放到线程中
        import asyncio
        from aiohttp import web
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        web.run_app(app, port=8080)

    # 启动后端服务
    threading.Thread(target=start_server, daemon=True).start()

    # 启动前端窗口
    webview.create_window(
        'B站弹幕姬-翻译版',
        'http://localhost:8080/frontend.html',
        width=900,
        height=1000,
        resizable=True,   # 允许自由调节窗口大小
        frameless=False,   # False为有系统边框，可拖动缩放
        # 设置最小窗口大小
        confirm_close=True,  # 关闭窗口时弹出确认框
    )
    webview.start()
