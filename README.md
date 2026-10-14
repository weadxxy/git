# 微光之境 · Lumenfall

一款可安装、离线游玩的 **Windows 横版像素冒险游戏**。拥有月光森林、萤火粒子、二段跳、挥剑、冲刺和星门通关。桌面版使用 Electron，所有画面、关卡和合成音效都随应用打包，不需要打开浏览器或连接服务器。

## 在 Windows 上玩

1. 打开本仓库的 [Releases 下载页面](https://github.com/weadxxy/git/releases)。
2. 在桌面版发布的附件中下载 `Lumenfall-1.1.0-Windows-x64-Setup.exe`。
3. 双击安装，选择安装目录并完成向导。
4. 双击桌面的 **微光之境 Lumenfall** 快捷方式即可游玩。

适用于 Windows 10/11 64 位。玩家无需安装 Node.js、npm 或任何开发工具。安装包未配置代码签名证书，Windows 可能提示发布者未知；请核对仓库来源与发布页的 SHA256 校验值，不要关闭系统防护。首次发布需要等待 [Windows desktop 构建](https://github.com/weadxxy/git/actions/workflows/windows-desktop.yml) 成功。

也可以从成功的 GitHub Actions 运行页面下载 `Lumenfall-Windows-x64` 附件，解压后运行其中的安装程序。

## 开发与打包

开发者需要 **Node.js 22.12+**（推荐 24）。在仓库目录执行：

```sh
npm ci
npm start
```

`npm start` 直接打开桌面窗口，不会启动 HTTP 服务。首次 `npm ci` 会下载与锁文件版本一致的 Electron。

生成 Windows 64 位安装包：

```sh
npm run build:win
```

输出为 `dist/Lumenfall-1.1.0-Windows-x64-Setup.exe`。安装程序会创建桌面和开始菜单快捷方式，支持选择安装目录及卸载。也可运行 `npm run build:portable` 生成免安装版，或 `npm run build:dir` 生成当前系统的解包应用。

仓库包含 GitHub Actions 工作流：推送到 `main` 时构建并上传 Windows 安装包；推送 `v*` 标签时，在 Windows 上测试源码及打包后的应用，然后创建对应 GitHub Release。安装包不提交进 Git 历史。

## 玩法

- **A / D 或左右方向键**：移动。
- **空格 / W / 上方向键**：跳跃；空中可再跳一次。
- **J**：挥剑，暗影需要两次攻击，也可以从上方踩踏消灭。
- **K / Shift**：短暂冲刺，穿过危险；有冷却时间。
- **Esc**：暂停或恢复。切换窗口会自动暂停。
- **F11**：桌面窗口全屏或退出全屏。
- **Ctrl + Q**：退出桌面应用。
- 触屏设备显示移动、跳跃、挥剑和冲刺按钮，建议横屏游玩。

关卡中共有 **12 枚光之碎片**，收集至少 **8 枚**，抵达最右侧星门即可通关。两个路灯会恢复生命并记录本局复活位置。死亡后可保留碎片，从最近的路灯继续；重新出发会重置本局。进度仅在本次运行中保留，关闭应用或刷新页面会重新开始。

声音默认关闭；点击右上角扬声器可开启合成环境音乐及交互音效。支持全屏与减少动态效果偏好。

## 验证

```sh
npm run check
npm run test:desktop
```

桌面集成测试使用 Playwright 控制真正的 Electron 窗口，验证离线资源加载、进程隔离、移动、二段跳、冲刺、挥剑、暂停、声音和全屏。在 Linux 无显示器的 CI 环境中需要 Xvfb；安装包仍面向 Windows。可设置 `LUMENFALL_EXECUTABLE` 来测试打包后的应用。

完整关卡回归测试可在开发时通过浏览器运行，无需修改游戏逻辑。测试工具为 Python Playwright 和 Chromium，先启动可选的网页开发服务器，再在另一个终端运行测试：

```sh
npm run dev:web
# 另一个终端
python tests/browser_test.py
```

测试以真实键盘和触屏事件运行游戏，不修改游戏状态。`?test=1` 仅提供只读状态用于断言；普通页面不暴露该接口。桌面测试通过 `--smoke-test` 启用同一个只读接口。

## 文件

- `desktop/main.cjs`：桌面窗口、本地资源协议和生命周期。
- `desktop/preload.cjs`：最小化隔离桥接，不暴露 Node.js 或文件系统权限。
- `electron-builder.yml`：Windows 安装包、快捷方式和图标配置。
- `.github/workflows/windows-desktop.yml`：Windows 原生测试、构建及标签发布。
- `game.js`：关卡、物理碰撞、战斗、程序化像素绘制、光效粒子和音频。
- `style.css`：响应式界面、触屏控件、暂停及通关弹窗。
- `server.mjs`：可选的网页开发服务器，桌面应用不依赖它。

这是完整的单关卡小游戏；角色、关卡和美术均为程序绘制，可以继续扩展关卡或替换为精灵图。
