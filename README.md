# 善行天下（Linknightcoin）本地部署指南

> 后AI时代德行分配制度 · 智谱AI验证 + 链上合约 · 本地一键部署

---

## 📋 部署清单

全新电脑只需要安装 **两样东西**：

| 依赖 | 版本要求 | 安装地址 |
|------|---------|---------|
| **Node.js** | ≥ 18.x | https://nodejs.org/ |
| **npm** | ≥ 8.x | 随 Node.js 自动安装 |

> 💡 安装后打开终端，执行 `node -v` 和 `npm -v` 确认安装成功。

---

## 🚀 快速部署（三步完成）

### 第一步：复制文件夹
将 `项目源码` 文件夹复制到新电脑任意位置，例如：
```
~/Linknightcoin/
```

### 第二步：安装后端依赖
```bash
cd ~/Linknightcoin/项目源码/backend
npm install
```

### 第三步：安装前端依赖
```bash
cd ../frontend
npm install
```

---

## ▶️ 启动服务

### 启动后端（端口 3000）
```bash
# 在 backend 目录下执行：
npm start
```
看到以下内容表示启动成功：
```
🚀 智谱AI + 区块链验证器 运行中: http://localhost:3000
```

### 启动前端（端口 8080）
新开一个终端窗口：
```bash
# 在 frontend 目录下执行：
npm start
```

或使用静态文件服务器：
```bash
npx http-server -p 8080 -c-1
```

---

## 🌐 开始使用

1. 打开浏览器，访问：**http://localhost:8080**
2. 点击右上角「连接钱包」（需要安装 MetaMask 浏览器插件）
3. 在 MetaMask 中切换到 **BNB Chain（BSC 主网）**
4. 填写善举描述（≥20字），开始验证

---

## ⚙️ 配置说明

### 后端配置文件
`项目源码/backend/.env`（首次部署需手动创建）

**步骤**：
```bash
cd 项目源码/backend
cp .env.example .env
```
然后用文本编辑器打开 `.env`，填入以下**必填项**：

| 配置项 | 说明 | 必填 |
|-------|------|------|
| `PRIVATE_KEY` | 运营钱包私钥（链上记录功值必需） | ⚠️ 是 |
| `ZHIPU_API_KEY` | 智谱AI API 密钥（善举验证必需） | ⚠️ 是 |
| `PORT` | 后端服务端口（默认 3000） | 否 |
| `BSC_RPC` | BSC 区块链 RPC 节点 | 否 |
| 合约地址 | 一般无需修改 | 否 |

> ⚠️ **安全提醒**：`.env` 文件包含私钥等敏感信息，**切勿上传至公开仓库或发送给他人**！

### 前端配置
`项目源码/frontend/index.html` 第 71 行：
```javascript
const API = 'http://localhost:3000/api';
```
如需修改后端地址，修改此处。

---

## 🔗 区块链合约地址（BSC 主网）

| 合约 | 地址 |
|------|------|
| LINK 代币 | `0xf24411ab56ac52938d27eaa53559d7cd7e122718` |
| MeritHalving | `0x37F113BC82db516c3dC378A320EeA3f9639D7271` |
| MeritLottery | `0x95BD41B8E21470EBE52d371167bC36c6b0D99afF` |
| Reward Pool | `0x95BD41B8E21470EBE52d371167bC36c6b0D99afF` |
| SubmissionLimiter | `0xAC51efdc783BbF529b12FCd47997C54bB592c464` |
| FeeRepurchaser | `0x9df6b4c0f45f3e28c0cc9a74db271929f4ea4651` |

> 在 BSCScan 上搜索合约地址可查看合约源码和交易记录。

---

## ⚠️ 已知限制（链上合约版本差异）

当前 BSC 主网合约状态与开发时可能有差异：

- `FeeRepurchaser.totalBurned()` — **已从合约移除**，调用会 revert
- `FeeRepurchaser.totalRepurchased()` — 正常，返回 0
- `MeritHalving.getUserMerits()` — **不可用**，用户功值需通过链上事件查询
- `MeritHalving.halvingCount()` — 可能不可用

如果"全网数据分析"页面部分数据显示为 0 或 N/A，这是链上合约接口变化导致的，**不是本地部署问题**。后端已做容错处理，不影响核心功能。

---

## 🔧 常见问题

### Q: npm install 很慢？
```bash
# 使用淘宝镜像加速
npm install --registry=https://registry.npmmirror.com
```

### Q: 后端启动报错 "Cannot find module 'ethers'"？
确保在 `backend` 目录下执行 `npm install`，不是项目根目录。

### Q: 前端连接不上后端？
确认后端已启动（`http://localhost:3000`），并检查前端 `index.html` 中的 `API` 地址。

### Q: MetaMask 无法连接？
需要安装 MetaMask 浏览器插件（https://metamask.io），并在设置中添加 BSC 网络。

### Q: 想部署到服务器？
后端使用 `PM2` 管理进程：
```bash
npm install -g pm2
pm2 start src/index-zhipu.js --name linkcoin-backend
```

---

## 📁 文件夹结构

```
Linknightcoin/
├── 资源包/
│   └── 安装说明.txt             ← 面向非技术用户
├── 项目源码/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index-zhipu.js              # 后端主程序
│   │   │   └── dynamic-questioning-zhipu.js # AI 提问模块
│   │   ├── .env.example                    # 配置模板（需复制为 .env 并填入密钥）
│   │   └── package.json
│   └── frontend/
│       ├── index.html          # 前端页面
│       ├── logo.png            # Logo 图片
│       ├── server.js           # 前端服务
│       └── package.json
└── README.md                    # 本文档
```

---

*善行天下 · 功不唐捐 · 玉汝于成*
