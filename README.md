# B站弹幕姬 - 人工智障翻译版

本项目是一个基于 Python 的 B 站直播弹幕姬，支持弹幕实时接收、百度翻译 API 多语种翻译、Web 前端展示，并支持自定义背景、参数记忆、弹幕弹窗等功能。适合学习交流，禁止商用。

## 功能特色

- 支持输入直播间房间号，实时接收弹幕
- 支持百度翻译 API，多语种弹幕翻译
- 支持 B 站 SESSDATA，显示弹幕发送者昵称
- 前端参数自动记忆与自动填充
- 支持自定义页面背景图片（上传图片自动保存为 bg.png）
- 弹幕点击弹窗，显示原文，弹窗位置智能跟随
- 登录/退出登录，后端弹幕监听自动重启
- 美观的前端 UI，适配桌面与移动端

## 快速开始

### 1. 安装依赖

```sh
pip install -r requirements.txt
```

### 2. 启动后端

```sh
python dmj.py
```
默认监听端口 8080。

### 3. 访问前端

在浏览器打开：
```
http://localhost:8080/frontend.html
```

### 4. 配置参数

- 填写直播间房间号（必填）
- 可选填写 B 站 SESSDATA（用于显示昵称）
- 填写百度翻译 APP ID 和密钥（必填）
- 支持参数自动记忆和自动填充

### 5. 更换背景

左下角点击“更换背景”按钮，上传图片后自动保存为 `bg.png`，下次启动自动加载。

### 6. 退出登录

右下角“退出登录”按钮可随时返回登录界面，并停止后端弹幕监听。

## 目录结构

```
blivedm/
    blivedm/
        clients/
        models/
        handlers.py
        utils.py
    frontend.html
    dmj.py
    requirements.txt
    config.json
    bg.png
```

## 注意事项

- 本项目仅供学习交流，**禁止商用**。
- 百度翻译 API 需自行申请 [百度翻译开放平台](https://api.fanyi.baidu.com/)。
- 若打包为 exe，建议用 PyInstaller 并指定 `--add-data "bg.png;."`。

## 致谢

- [blivedm](https://github.com/lzghzr/blivedm) 弹幕协议支持
- 百度翻译开放平台

---

作者：@XRyon  
本项目仅供学习交流，禁止商用。
