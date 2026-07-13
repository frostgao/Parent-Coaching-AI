# 家长沟通练习系统 - Parent Coaching AI

> 与抑郁青少年陈晓的对话练习，练习「看见情绪、练习叩门」的亲子沟通技巧

![Demo](https://img.shields.io/badge/status-active-brightgreen.svg)
![React](https://img.shields.io/badge/react-19.2-blue.svg)
![FastAPI](https://img.shields.io/badge/fastapi-0.115-blue.svg)
![Python](https://img.shields.io/badge/python-3.10+-blue.svg)

---

## 项目简介

这是一个**亲子沟通训练模拟系统**，通过AI对话练习，帮助家长学习如何与有轻度抑郁情绪的青少年进行有效沟通。

### 核心功能

- **双Agent架构**：裁判Agent（评分）+ 演员Agent（扮演陈晓）
- **实时情绪反馈**：基于四维度评分体系（靠近/倾听/共情/引导）
- **对话复盘报告**：生成详细的对话分析和改进建议
- **语音输入支持**：支持文字和语音两种输入方式

### 陈晓角色设定

- 16岁上海女生，初三学生
- 轻度抑郁，因数学老师当众羞辱产生进教室的生理应激
- 喜欢画画——这是她唯一感到有价值的事
- 性格内向，自尊心强，渴望被理解又害怕被否定

---

## 技术架构

```
Parent Coaching AI/
├── Frontend/              # React + TypeScript 前端应用
│   ├── src/
│   │   ├── routes/        # TanStack Router 路由
│   │   ├── components/    # UI组件
│   │   └── lib/           # 工具函数
│   ├── public/            # 静态资源
│   └── package.json
│
├── Backend/               # Python FastAPI 后端服务
│   ├── App.py             # 主程序（FastAPI + AI逻辑）
│   ├── prompt.md          # 陈晓角色设定
│   ├── scoring.md         # 评分标准
│   └── requirements.txt
│
└── 知识库.md              # 项目知识库文档
```

### 前端技术栈

| 类别 | 技术 |
|------|------|
| 框架 | React 19 + TypeScript |
| 构建 | Vite 7.3 |
| 路由 | TanStack Router |
| UI组件 | shadcn/ui (Radix UI) |
| 样式 | Tailwind CSS 4.2 |
| 图标 | Lucide React |
| 表单 | React Hook Form + Zod |
| 数据流 | TanStack Query |

### 后端技术栈

| 类别 | 技术 |
|------|------|
| 框架 | FastAPI |
| 服务器 | Uvicorn |
| AI API | 阿里百炼 (DashScope) |
| 模型 | Qwen系列 (qwen-turbo/plus/max) |
| 数据验证 | Pydantic |

---

## 快速开始

### 环境准备

- Node.js 18+ 和 npm
- Python 3.10+ 和 pip
- 阿里百炼 API Key ([获取地址](https://dashscope.console.aliyun.com/))

### 本地开发

#### 1. 克隆项目

```bash
cd "Parent Coaching AI前端+后端"
```

#### 2. 配置后端

```bash
cd Backend
cp .env.example .env  # 如果有示例文件
# 编辑 .env，添加你的阿里百炼 API Key
DASHSCOPE_API_KEY=sk-你的密钥
```

#### 3. 启动后端

```bash
cd Backend
pip install -r requirements.txt
uvicorn App:api --host 0.0.0.0 --port 8000 --reload
```

后端默认运行在 `http://localhost:8000`

#### 4. 配置前端

```bash
cd ../Frontend
cp .env.example .env  # 如果有示例文件
# 编辑 .env
VITE_API_BASE_URL=http://localhost:8000
```

#### 5. 启动前端

```bash
cd Frontend
npm install
npm run dev
```

前端默认运行在 `http://localhost:8080`

---

## 四维度评分体系

### 1. 靠近（满分20分）
- **发现信号**：注意到孩子的异常状态，而非任务/规则
- **低压力叩门**：给孩子留退路，不强迫回应

### 2. 倾听（满分21分）
- **情绪命名**：准确说出孩子的感受，不带评判
- **开放式提问**：真正开放的问题，不预设答案
- **反映核心感受**：复述孩子的感受，而非事实

### 3. 共情（满分18分）
- **不接"但是"**：验证情绪后停住，不转向任务
- **承认自身盲区**：具体承认，不辩解
- **给予肯定**：具体肯定，不附条件

### 4. 引导（满分9分）
- **委婉建议**：小、具体、今天就能做、可选
- **给出选择权**：明确说出"不也可以"

---

## API 接口文档

### 健康检查
```
GET /
Response: {"message": "hello world"}
```

### 对话接口
```
POST /chat
Content-Type: application/json

Request:
{
  "message": "用户输入",
  "history": [{"role": "user", "content": "..."}],
  "current_score": 35,
  "ledger": {}
}

Response:
{
  "reply": "陈晓的回复",
  "delta": 5,
  "reason": "评分解释",
  "ledger": {}
}
```

### 复盘报告
```
POST /report
Content-Type: application/json

Request:
{
  "score": 85,
  "msgs": [...]
}

Response:
{
  "monologue": "陈晓的内心独白",
  "overall": "整体感受",
  "reachedLabel": "本轮走到了哪里",
  "stageFeedback": [...],
  "bestTake": "本轮最值得带走的",
  "nextFocus": "下次重点练习"
}
```

---

## 部署指南

### 生产环境部署

1. **部署后端**
   - 使用 `nohup` 或 `systemd` 启动
   - 配置 Nginx 反向代理
   - 确保 CORS 正确配置

2. **部署前端**
   - `npm run build` 生成生产版本
   - 将 `dist/` 目录部署到静态服务器
   - 确保 API 地址配置正确

3. **环境变量**
   - 后端：`DASHSCOPE_API_KEY`
   - 前端：`VITE_API_BASE_URL`

详细部署指南请参考 `知识库.md` 的「部署」章节。

---

## 重要说明

### 免责声明

本工具仅为**亲子沟通训练模拟**，不具备心理诊疗、抑郁诊断功能，不能替代精神科医生、持证心理咨询师专业服务。

### 数据隐私

- 用户对话数据仅在本地临时存储
- 不对外共享任何用户内容
- API Key 不应提交到版本控制系统

---

## 项目文件说明

| 文件/目录 | 说明 |
|-----------|------|
| `Frontend/` | React 前端应用 |
| `Backend/` | Python FastAPI 后端 |
| `知识库.md` | 项目知识库（架构、踩坑、调试） |
| `Frontend/package.json` | 前端依赖配置 |
| `Backend/requirements.txt` | 后端依赖配置 |
| `Backend/.env` | 后端环境变量（API Key） |
| `Frontend/.env` | 前端环境变量（API地址） |

---

## 常见问题

### Q: 后端启动失败？
A: 检查 `DASHSCOPE_API_KEY` 是否正确配置，访问 `/` 接口测试。

### Q: 前端无法连接后端？
A: 检查 `VITE_API_BASE_URL` 配置，确保后端服务正常运行。

### Q: 如何修改评分标准？
A: 修改 `Backend/new_criteria.md` 文件，重启后端生效。

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

---

## 许可证

MIT License

---

## 联系方式

如有问题，请通过 GitHub Issues 联系。
