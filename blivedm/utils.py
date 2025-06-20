# -*- coding: utf-8 -*-
import time
import urllib.parse
from functools import reduce
from hashlib import md5

USER_AGENT = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/102.0.0.0 Safari/537.36'
)


def make_constant_retry_policy(interval: float):
    def get_interval(_retry_count: int, _total_retry_count: int):
        return interval
    return get_interval


def make_linear_retry_policy(start_interval: float, interval_step: float, max_interval: float):
    def get_interval(retry_count: int, _total_retry_count: int):
        return min(
            start_interval + (retry_count - 1) * interval_step,
            max_interval
        )
    return get_interval


mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
    33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
    61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
    36, 20, 34, 44, 52
]


def get_mixin_key(orig: str):
    return reduce(lambda s, i: s + orig[i], mixinKeyEncTab, '')[:32]


def wbi_sign(params: dict, img_key: str, sub_key: str):
    mixin_key = get_mixin_key(img_key + sub_key)
    curr_time = round(time.time())
    params = params.copy()
    params['wts'] = curr_time
    params = dict(sorted(params.items()))
    # 过滤 value 中的 "!'()*" 字符
    params = {
        k: ''.join(filter(lambda chr: chr not in "!'()*", str(v)))
        for k, v in params.items()
    }
    query = urllib.parse.urlencode(params)
    wbi_sign = md5((query + mixin_key).encode()).hexdigest()
    params['w_rid'] = wbi_sign
    return params


async def get_wbi_keys(session):
    """
    异步获取 img_key 和 sub_key
    """
    url = 'https://api.bilibili.com/x/web-interface/nav'
    headers = {
        'User-Agent': USER_AGENT,
        'Referer': 'https://www.bilibili.com/'
    }
    async with session.get(url, headers=headers) as resp:
        resp.raise_for_status()
        json_content = await resp.json()
        img_url: str = json_content['data']['wbi_img']['img_url']
        sub_url: str = json_content['data']['wbi_img']['sub_url']
        img_key = img_url.rsplit('/', 1)[1].split('.')[0]
        sub_key = sub_url.rsplit('/', 1)[1].split('.')[0]
        return img_key, sub_key
