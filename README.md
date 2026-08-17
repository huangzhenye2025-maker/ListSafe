# 🛡️ ListSafe - Etsy & 跨境电商 Listing 风险拦截与商标合规插件

> **ListSafe** 是一款专为海外电商卖家（Etsy、Shopify、Amazon Merch 等）打造的轻量级、高付费意愿 Chrome 浏览器扩展（遵循 Google Manifest V3 最新规范）。它在卖家编辑 Listing 时提供**秒级实时商标侵权拦截、一键安全词替换、Etsy 标签合规检测与安全评分（0~100 分）**，彻底避免店铺因无意识踩雷遭到 DMCA 侵权投诉或封禁。

---

## 📂 项目结构概览

```text
ListSafe/
├── manifest.json              # Chrome Manifest V3 核心配置文件
├── background/
│   └── service-worker.js      # 后台服务：规则调度、License 激活校验与 Badge 状态管理
├── content/
│   ├── content.js             # 页面注入脚本：实时监听标题/标签输入、高亮风险与一键替换
│   └── content.css            # 悬浮安全卡片、内嵌推荐芯片与浮动安全仪表盘样式
├── popup/
│   ├── popup.html             # 插件弹窗主界面（Listing 体检、商标库速查、Pro 激活）
│   ├── popup.js               # 弹窗交互控制逻辑
│   └── popup.css              # 现代极简暗黑与玻璃拟态 UI 样式
├── data/
│   └── trademark-database.json # 精选 200+ 海外电商最高危商标词库及安全替代词
├── utils/
│   ├── i18n.js                # 国际化多语言引擎 (支持 英语、中文、德语、法语、西语、日语)
│   └── rule-engine.js         # 高性能正则分词、全词匹配与 Listing 风险打分引擎
├── icons/                     # 插件 16px, 32px, 48px, 128px 及 SVG 图标
├── demo/
│   ├── mock-etsy-editor.html  # 1:1 独立交互式 Etsy 模拟编辑页面（含多语言实时切换）
│   ├── mock-editor.js         # 模拟测试环境预设与控制脚本
│   └── mock-editor.css        # 模拟编辑器样式
├── marketing/                 # 海外冷启动与变现资料包
│   ├── reddit-launch-post.md  # r/Etsy / r/PrintOnDemand 高转化无封禁贴文模板
│   ├── chrome-store-listing.md# Chrome Web Store 官方上架 SEO 标题与长文案
│   └── monetization-strategy.md# 定价梯队、Lemon Squeezy 支付对接与变现模型
└── README.md
```

---

## 🌐 6 国语言国际化支持 (Multi-Language i18n)

ListSafe 内置原生多国语言国际化引擎，自动适配用户操作系统与浏览器语言，并在 Popup 顶部及 Demo 测试页右上角提供**一键秒级切换**：
* 🇺🇸 **English** (英语) - 全球出海主流语言
* 🇨🇳 **简体中文** (Chinese) - 专为中国跨境出海卖家与跨境电商卖家深度定制
* 🇩🇪 **Deutsch** (德语) - 欧洲最大 Etsy / Amazon 电商市场
* 🇫🇷 **Français** (法语) - 欧洲关键跨境市场
* 🇪🇸 **Español** (西班牙语) - 西班牙及拉美/北美双语卖家
* 🇯🇵 **日本語** (日语) - 亚太高端手工及越境电商卖家

---

## 🚀 快速上手与本地测试 (How to Test)

### 方式一：本地 HTTP 服务打开交互式测试沙盒 (推荐，最快)
> ⚠️ 注意：请**不要**直接双击 `mock-etsy-editor.html`。浏览器出于安全策略会拦截 `file://` 页面中对本地 JSON 的 `fetch()`，导致词库加载失败。请用本地 HTTP 服务打开：

```text
# 在项目根目录执行（任选其一）：
python -m http.server 8000
```

然后浏览器访问：
👉 http://localhost:8000/demo/mock-etsy-editor.html

（已加载本扩展时，插件会自动在沙盒页上生效；未加载扩展也能以独立沙盒模式运行。）

**可体验的核心功能**：
1. **多语言一键切换**：右上角切换 `🇨🇳 简体中文`、`🇺🇸 English` 等，页面所有提示、悬浮卡片、按钮即时切换；
2. **预设用例切换**：点击顶部 `🚨 Case 1: Mother's Day Sweatshirt` 或 `🚨 Case 2: Stanley Cup & Swiftie`；
3. **实时风险拦截**：输入框下方立即弹出 ⚠️ 红色高危商标警示（如 `Boy Mom`, `Mama Bear`, `Onesie` 等）；
4. **1-Click 替换**：点击推荐的绿色安全词芯片（如 `Mother of Boys`），输入框自动平滑替换；
5. **悬浮安全仪表盘**：右下角实时查看 0~100 安全评分，点击 `✨ Auto-Fix All` 一键修复整篇 Listing！

---

### 方式二：在 Chrome 浏览器中加载此扩展

1. 打开 Google Chrome 浏览器，在地址栏输入：
   ```text
   chrome://extensions
   ```
2. 在右上角开启 **“开发者模式” (Developer mode)**；
3. 点击左上角 **“加载已解压的扩展程序” (Load unpacked)**；
4. 选择本项目所在目录：`c:\Users\Haye\Desktop\Antigravity\ListSafe`；
5. 加载完成后，点击浏览器右上角的扩展图标即可弹出 ListSafe 插件控制台，并在右上角自由切换语言！

---

## 💎 Pro 会员激活测试码

在插件 Popup 的 **"⚡ Pro & Setup"** 选项卡中，输入以下任意测试 License Key 即可立即激活 Pro 专业版：
* `LISTSAFE-PRO-2026`
* `ETSY-SAFE-PRO`
* `DEMO-VIP-2026`

---

## 📈 变现与冷启动建议
请参阅 `marketing/` 目录下的全套海外运营方案：
* [Reddit 冷启动贴文包](file:///c:/Users/Haye/Desktop/Antigravity/ListSafe/marketing/reddit-launch-post.md)
* [Chrome 商店上架资料](file:///c:/Users/Haye/Desktop/Antigravity/ListSafe/marketing/chrome-store-listing.md)
* [商业化定价与支付对接](file:///c:/Users/Haye/Desktop/Antigravity/ListSafe/marketing/monetization-strategy.md)
