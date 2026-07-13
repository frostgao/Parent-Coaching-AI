# Parent Coaching AI 项目指南

## 项目概览

这是一个**亲子沟通训练模拟系统**，通过AI对话练习帮助家长学习如何与有轻度抑郁情绪的青少年进行有效沟通。

### 核心架构

- **双Agent系统**：
  - **Judge Agent（裁判）**：两步评分逻辑（第一步识别维度/质量/连贯性，第二步综合输出原因）
  - **Actor Agent（演员）**：生成陈晓的回复台词
- **四维度评分体系**：靠近（20分）+ 倾听（21分）+ 共情（18分）+ 引导（9分）= 总分88分
- **技术栈**：React 19 + TypeScript + Vite + FastAPI + 阿里百炼Qwen模型

---

## 项目结构

```
Parent Coaching AI前端+后端/
├── Frontend/                    # React + TypeScript 前端
│   ├── src/
│   │   ├── routes/
│   │   │   └── index.tsx       # 主聊天界面（唯一业务路由）
│   │   ├── components/         # UI组件（shadcn/ui）
│   │   ├── lib/                # 工具函数
│   │   ├── server.ts           # TanStack Start服务端入口
│   │   └── start.ts            # 服务端启动文件
│   ├── package.json
│   ├── vite.config.ts
│   └── components.json
│
├── Backend/                     # Python FastAPI 后端
│   ├── App.py                  # 主程序（800+行）
│   │   ├── chat_engine()       # 核心对话引擎
│   │   ├── judge_agent()       # 双步裁判逻辑
│   │   ├── update_ledger()     # 账本管理（唯一计分入口）
│   │   ├── chat_api()          # /chat 接口
│   │   ├── report_api()        # /report 接口
│   │   └── reset_api()         # /reset 接口
│   ├── prompt.md               # 陈晓角色设定
│   ├── new_criteria.md         # 评分标准
│   ├── judge_prompt_1.md       # 裁判第一步识别逻辑
│   ├── judge_prompt_2.md       # 裁判第二步综合输出
│   ├── judge_prompt_3.md       # 推荐话术生成逻辑
│   ├── recommendation.md       # 推荐话术参考
│   ├── requirements.txt
│   └── .env                    # API Key配置
│
└── 知识库.md                     # 项目知识库文档
```

---

## 关键文件说明

### Frontend/src/routes/index.tsx

**主聊天界面**，包含：
- `App` 组件：状态管理（score, msgs, ledger, turn）
- `IntroStack`：5页引导界面（角色介绍、目标、技巧、陈晓画像、背景信息）
- `Chat`：聊天界面（消息列表、输入框、建议按钮）
- `Debrief`：复盘报告界面
- `callBackend()`：调用后端 `/chat` 接口
- `generateReport()`：调用后端 `/report` 接口

**重要常量**：
- `INIT = 35`：初始情绪值
- `PASS = 100`：通关分数
- `MELT = 0`：熔断分数
- `GOOD = 85`：优秀分数
- `ALERT = 15`：预警分数

### Backend/App.py

**核心逻辑**：
1. 加载 prompt 和评分标准文件
2. `chat_engine()`：处理用户输入，调用裁判和演员
3. `judge_agent()`：两步裁判（第一步temperature=0.1，第二步temperature=0.6）
4. `update_ledger()`：唯一计分入口（good/great封顶，bad不封顶）
5. `actor()`：生成陈晓回复（qwen-plus模型）

**重要函数**：
- `extract_text()`：清洗AI返回内容
- `load_system_prompt()`：加载陈晓角色设定
- `load_scoring_criteria()`：加载评分标准
- `_format_attribution_tags()`：清洗attribution_tags格式

### Backend/prompt.md

**陈晓人设核心**：
- 16岁上海女生，轻度抑郁
- 因数学老师当众羞辱产生进教室的生理应激
- 喜欢画画（唯一感到有价值的事）
- 矛盾的求助意愿：希望被问"你怎么了"，但"但是"之后所有理解归零

---

## 核心工作流

### 对话流程

```
用户输入 → callBackend() → /chat → chat_engine()
         → judge_agent(两步) → update_ledger() → actor()
         → 返回陈晓回复 → 更新前端State → 渲染
```

### 评分机制

1. **裁判第一步**（judge_1）：识别维度、quality、coherence、depth
2. **裁判第二步**（judge_2）：综合历史、账本、第一步结果，输出reason和attribution_tags
3. **update_ledger()**：根据quality决定分数（good/great封顶于维度max，bad不封顶）
4. **attribution_tags清洗**：用 `_format_attribution_tags()` 转换格式
5. **演员生成**：传入user_message、attribution_tags、new_score、last_chen、actor_scene

---

## 开发指南

### 本地开发

```bash
# 启动后端
cd Backend
uvicorn App:api --host 0.0.0.0 --port 8000 --reload

# 启动前端
cd Frontend
npm run dev
```

### 添加新功能

1. **修改评分标准**：编辑 `Backend/new_criteria.md`，重启后端
2. **修改陈晓人设**：编辑 `Backend/prompt.md`
3. **修改前端UI**：编辑 `Frontend/src/routes/index.tsx`
4. **添加新组件**：使用 `npx shadcn-ui@latest add [component]`

### 调试技巧

1. **检查裁判输出**：在 `judge_agent()` 中添加 `print()` 查看第一步和第二步输出
2. **检查账本状态**：在 `update_ledger()` 中打印 `ledger` 查看各维度earned值
3. **检查演员输入**：在 `actor()` 中打印最终prompt
4. **前端调试**：使用浏览器开发者工具查看Network标签页的API调用

---

## 常见任务

### 修改评分维度

评分维度定义在 `Backend/new_criteria.md`，主要维度包括：
- 靠近组：发现信号、低压力叩门
- 倾听组：情绪命名、反映核心感受、开放式提问
- 共情组：不接但是、承认自身盲区、给予肯定
- 引导组：委婉建议、给出选择权

### 修改陈晓的回复风格

编辑 `Backend/prompt.md`，关键约束：
- 单一结构律：动作（括号）+ 台词
- 严禁散文诗碎嘴
- 严禁连续两轮使用相同动作
- 措辞和句式不能重复

### 添加新的初始建议选项

在 `Frontend/src/routes/index.tsx` 的 `TURN_OPTIONS` 数组中添加：

```typescript
[
  {
    label: "选项标签",
    text: "用户输入文本",
    delta: 5,  // 分数变化
    stage: "维度名称",
    chen: { parens: "动作", text: "回复" },
    explain: "解释说明"
  }
]
```

---

## 重要概念

### Ledger（账本）

**唯一计分入口**，记录每个维度的：
- `earned`：已得分
- `max`：维度上限
- `consecutive`：连续轮数

**重要规则**：
- good/great：封顶于维度max
- bad：不封顶（信任难赚易失）
- neutral：0分

### Attribution Tags

孩子主观感受标签数组，格式：`[标签1][标签2]`

**清洗函数**：`_format_attribution_tags()` 将list转换为字符串格式

### Coherence（连贯性）

- `normal`：正常，话锋一致
- `pivot`：话锋突变（前几轮共情，突然催上学）
- `irrelevant`：和孩子刚说的话完全无关

---

## 部署配置

### 生产环境

1. **后端**：使用 `nohup` 或 `systemd` 启动
2. **前端**：`npm run build` 生成 `dist/` 目录
3. **Nginx**：配置静态文件和反向代理
4. **环境变量**：`DASHSCOPE_API_KEY`（后端）、`VITE_API_BASE_URL`（前端）

详细部署指南请参考 `知识库.md` 的「部署」章节。

---

## 踩坑记录

### 已修复的问题

1. **attribution_tags类型错误**：list的repr会泄露进演员prompt → 统一用 `_format_attribution_tags()` 清洗
2. **ledger状态未持久化**：前端State没有保存返回的updated_ledger → 每轮必须存回ledger
3. **random.choice作用在字符串上**：会随机取出一个字符 → 改为 `random.choice(list)`
4. **演员输出评分内容**：演员承担了不该承担的裁判职责 → 双Agent解耦后演员只输出台词

### 调试方法论

1. **改prompt最有效的方式**：加具体示例，不是加抽象规则
2. **裁判两步互相矛盾**：第一步永远赢 → 说明评分标准太模糊
3. **验证修改是否有效**：找具体反例输入，对比改前改后的输出

---

## 相关文件索引

| 文件 | 说明 |
|------|------|
| `Frontend/src/routes/index.tsx` | 主聊天界面 |
| `Backend/App.py` | 后端主程序 |
| `Backend/prompt.md` | 陈晓角色设定 |
| `Backend/new_criteria.md` | 评分标准 |
| `Backend/judge_prompt_1.md` | 裁判第一步 |
| `Backend/judge_prompt_2.md` | 裁判第二步 |
| `Backend/judge_prompt_3.md` | 推荐话术生成 |
| `知识库.md` | 项目知识库 |

---

## 技术支持

如有问题，请参考：
1. `知识库.md` 的「核心踩坑记录」章节
2. `知识库.md` 的「调试方法论」章节
3. 项目代码中的注释
