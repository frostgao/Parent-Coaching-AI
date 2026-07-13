import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import chenXiaoImg from "@/assets/chen-xiao.jpg";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "陈晓 · 家长沟通练习" },
      { name: "description", content: "与抑郁青少年陈晓的对话练习，看见情绪、练习叩门。" },
    ],
  }),
  component: App,
});

type View = "intro" | "chat" | "debrief";
type Msg = {
  id: number;
  who: "parent" | "child";
  text: string;
  delta?: number;
  scoreAfter?: number;
  explain?: string;
  parens?: string;
  stage?: Stage;
};
type Stage = string;

const INIT = 35;
const PASS = 100;
const MELT = 0;
const GOOD = 85;
const ALERT = 15;

/* ───────────── Report data type ───────────── */

type ReportData = {
  monologue: string;
  overall: string;
  reachedLabel: string;
  stageFeedback: { stage: Stage; items: string[] }[];
  bestTake: string;
  nextFocus: string;
  encourageFinal: string;
};

/* ───────────── Backend call for report ───────────── */

async function generateReport(
  score: number,
  msgs: Msg[]
): Promise<ReportData> {
  const res = await fetch(`${API_BASE_URL}/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      score,
      msgs: msgs.map((m) => ({
        who: m.who,
        text: m.parens ? `（${m.parens}）${m.text}` : m.text,
        stage: m.stage,
        delta: m.delta,
      })),
    }),
  });
  const data = await res.json();
  console.log("报告数据:", data);
  return {
    monologue: data.monologue,
    overall: data.overall,
    reachedLabel: data.reachedLabel,
    stageFeedback: data.stageFeedback,
    bestTake: data.bestTake,
    nextFocus: data.nextFocus,
    encourageFinal: data.encourageFinal,
  };
}

/* ───────────── Scripted suggestions for turns 1-3 ───────────── */

type Option = {
  label: string;                 // short chip label
  text: string;                  // what gets sent
  delta: number;
  stage: Stage;
  chen: { parens?: string; text: string };
  explain: string;
};

/* ───────────── Ledger initialization ───────────── */

function initLedger(): Record<string, { type: string; earned: number; max?: number; consecutive: number; group?: string }> {
  return {
    // ── 特殊维度（独立处理）──
    "不接但是":     {"type": "special_penalty", "earned": 0, "consecutive": 0},
    "承认自身盲区": {"type": "special_bonus", "earned": 0, "max": 6, "consecutive": 0},

    // ── 常规维度分组 ──
    // 觉察叩门组（上限20）
    "发现信号":     {"type": "normal", "group": "觉察叩门组", "earned": 0, "consecutive": 0},
    "低压力叩门":   {"type": "normal", "group": "觉察叩门组", "earned": 0, "consecutive": 0},

    // 情绪接纳组（上限20）
    "情绪命名":     {"type": "normal", "group": "情绪接纳组", "earned": 0, "consecutive": 0},
    "反映核心感受": {"type": "normal", "group": "情绪接纳组", "earned": 0, "consecutive": 0},

    // 深挖引导组（上限15）
    "开放式提问":   {"type": "normal", "group": "深挖引导组", "earned": 0, "consecutive": 0},

    // 同盟肯定组（上限15）
    "给予肯定":     {"type": "normal", "group": "同盟肯定组", "earned": 0, "consecutive": 0},

    // 收尾组（上限10）
    "委婉建议":     {"type": "normal", "group": "收尾组", "earned": 0, "consecutive": 0},
    "给出选择权":   {"type": "normal", "group": "收尾组", "earned": 0, "consecutive": 0},
  };
}

const TURN_OPTIONS: Option[][] = [
  [
    {
      label: "从「你」起手",
      text: "妈妈注意到你今天回来就进房间了，饭也没出来吃。我不催你，就想让你知道我在。",
      delta: 5,
      stage: "发现信号",
      chen: { parens: "手里的画笔停顿了一下，没叫妈妈走", text: "……" },
      explain: "🌟 起点是「我看见你」，不是「饭凉了」。陈晓感受到的是被注意到，不是被要求。",
    },
    {
      label: "从「饭」起手",
      text: "一回家就进房间，也不出来吃饭，现在饭都凉了，再这样下去身体怎么受得了？",
      delta: -6,
      stage: "发现信号",
      chen: { parens: "把脸埋进画本里", text: "我不饿，你出去。" },
      explain: "⚠️ 第一句话从任务/规则切入，陈晓感受到的是压力，门马上关紧。",
    },
    {
      label: "点个外卖关心一下",
      text: "看到你没出来吃饭，我直接给你点个外卖放门口了啊。",
      delta: 3,
      stage: "发现信号",
      chen: { parens: "没抬头", text: "……哦，谢谢。" },
      explain: "💡 有观察到孩子的异常情绪，但立刻跳转到提供解决方案。",
    },
  ],
  [
    {
      label: "声明不强求",
      text: "不用现在说话，妈妈就是想让你知道我在。想聊的时候门开着。",
      delta: 8,
      stage: "低压力叩门",
      chen: { parens: "把手机放到一边，身体稍微转向门", text: "……嗯。" },
      explain: "🌟 主动声明「不强求」，把选择权还给她——她第一次可以不用防着这次对话。",
    },
    {
      label: "命名感受",
      text: "妈妈感觉你现在很累，不是那种睡一觉能好的累。",
      delta: 8,
      stage: "情绪命名",
      chen: { parens: "声音很轻", text: "嗯。" },
      explain: "🌟 「撑不住」这个词精准落在感受里，她用一声「嗯」确认：你说对了。",
    },
    {
      label: "接「但是」",
      text: "妈妈知道你不容易，但学还是要上的，我们一起想想办法。",
      delta: -8,
      stage: "不接但是",
      chen: { parens: "重新拿起手机", text: "我累了。" },
      explain: "⚠️ 「但」字之后，前面所有理解归零。她感受到的是：你说那些只是为了说这一句。",
    },
  ],
  [
    {
      label: "停在验证",
      text: "妈妈感觉到你现在很痛苦——不是难过，是那种撑不住的感觉。",
      delta: 7,
      stage: "情绪命名",
      chen: { parens: "低头", text: "其实……我也不知道为什么。" },
      explain: "🌟 验证完停住了，没有接「但是」——防御又松了一层。",
    },
    {
      label: "开放式追问",
      text: "你愿意跟我说说，最近最难的是什么吗？",
      delta: 7,
      stage: "开放式提问",
      chen: { parens: "停顿", text: "其实……我也不知道为什么。" },
      explain: "💡 是开放式问题，陈晓正在尝试开口。",
    },
    {
      label: "复述行为",
      text: "所以你是不想去上学，对吗？",
      delta: -6,
      stage: "开放式提问",
      chen: { parens: "侧过身", text: "……随便你怎么想吧。" },
      explain: "⚠️ 复述停在行为层面，还施加了让孩子承认的压力。",
    },
  ],
];

/* ───────────── Backend call ───────────── */

async function callBackend(
  text: string,
  history: Msg[],
  currentScore: number,
  currentLedger: Record<string, unknown>
): Promise<{ delta: number; stage: Stage; chen: { parens?: string; text: string }; explain: string; newLedger: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: text,
      history: history.map((m: Msg) => ({
        role: m.who === "parent" ? "user" : "assistant",
        content: m.parens ? `（${m.parens}）${m.text}` : m.text,
      })),
      current_score: currentScore,
      ledger: currentLedger,
    }),
  });
  const data = await res.json();
  const reply: string = data.reply ?? "";
  const parensMatch = reply.match(/^（(.{0,20})）/);
  const parens = parensMatch ? parensMatch[1] : undefined;
  const text2 = parens ? reply.replace(/^（.{0,20}）\s*/, "") : reply;
  return {
    delta: data.delta ?? 0,
    stage: "深挖与理解",
    chen: { parens, text: text2 },
    explain: data.reason ?? "",
    newLedger: data.ledger ?? currentLedger,
  };
}


function App() {
  const [view, setView] = useState<View>("intro");
  const [score, setScore] = useState(INIT);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [ledger, setLedger] = useState<Record<string, unknown>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [turn, setTurn] = useState(0); // parent turns sent
  const [usedFreeInput, setUsedFreeInput] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, thinking]);

  function start() {
    setScore(INIT);
    setMsgs([]);
    setTurn(0);
    setUsedFreeInput(false);
    setView("chat");
  }

  function endIfNeeded(newScore: number) {
    // 不再自动跳转，只用于通知用户已结束（通过 ended 状态）
  }

  function sendOption(opt: Option) {
    if (thinking) return;
    const id = Date.now();
    
    // 初始化 ledger（如果为空）
    let updatedLedger = ledger;
    if (Object.keys(ledger).length === 0) {
      updatedLedger = initLedger();
      setLedger(updatedLedger);
    }
    
    // 更新 ledger（基于 stage，即 ledger 的维度）
    const dim = opt.stage as string;
    if (updatedLedger[dim]) {
      if (opt.delta > 0) {
        // 得分：earned 加分，consecutive +1
        updatedLedger = {
          ...updatedLedger,
          [dim]: {
            ...updatedLedger[dim],
            earned: (updatedLedger[dim] as any).earned + opt.delta,
            consecutive: (updatedLedger[dim] as any).consecutive + 1,
          },
        };
      } else if (opt.delta === 0) {
        // 不扣分/得零分：earned 不变，consecutive +1
        updatedLedger = {
          ...updatedLedger,
          [dim]: {
            ...updatedLedger[dim],
            consecutive: (updatedLedger[dim] as any).consecutive + 1,
          },
        };
      }
      // delta < 0（扣分）： earned 和 consecutive 都不变
      setLedger(updatedLedger);
    }
    
    setMsgs((m: Msg[]) => [...m, { id, who: "parent", text: opt.text, stage: opt.stage }]);
    setThinking(true);
    const newScore = Math.max(0, Math.min(100, score + opt.delta));
    setTimeout(() => {
      setMsgs((m: Msg[]) => [
        ...m,
        {
          id: id + 1,
          who: "child",
          parens: opt.chen.parens,
          text: opt.chen.text,
          delta: opt.delta,
          scoreAfter: newScore,
          explain: opt.explain,
          stage: opt.stage,
        },
      ]);
      setScore(newScore);
      setThinking(false);
      setTurn((t) => t + 1);
      endIfNeeded(newScore);
    }, 900);
  }

    async function sendFree() {
      const text = input.trim();
      if (!text || isLoading) return;
      
      // 第一次进入自由输入模式时标记
      setUsedFreeInput(true);
      
      setInput("");
      setIsLoading(true);

      const parentMsg: Msg = { id: Date.now(), who: "parent", text };
      setMsgs((prev: Msg[]) => [...prev, parentMsg]);

      try {
        const result = await callBackend(text, msgs, score, ledger);
        const newScore = Math.max(MELT - 5, Math.min(100, score + result.delta));
        setScore(newScore);
        setLedger(result.newLedger);

        const chenMsg: Msg = {
          id: Date.now() + 1,
          who: "child",
          text: result.chen.text,
          parens: result.chen.parens,
          delta: result.delta,
          scoreAfter: newScore,
          explain: result.explain,
          stage: result.stage,
        };
        setMsgs((prev: Msg[]) => [...prev, chenMsg]);

        // 不再自动跳转，用户可手动点击右下角按钮查看报告
      } catch (e) {
        const errMsg: Msg = {
          id: Date.now() + 1,
          who: "child",
          text: "（网络错误，请检查后端是否运行）",
          delta: 0,
          scoreAfter: score,
          explain: String(e),
        };
        setMsgs((prev: Msg[]) => [...prev, errMsg]);
      } finally {
        setIsLoading(false);
      }
    }

  return (
    <main className="min-h-screen bg-background paper-grain">
      <div className="mx-auto max-w-[440px]">
        {view === "intro" && <IntroStack onStart={start} />}
        {view === "chat" && (
<Chat
             score={score}
             msgs={msgs}
             input={input}
             setInput={setInput}
             sendFree={sendFree}
             isLoading={isLoading}
             ledger={ledger}
             setLedger={setLedger}
             onPickOption={sendOption}
             turn={turn}
             usedFreeInput={usedFreeInput}
             onExit={() => setView("debrief")}
             onBackToDebrief={() => setView("debrief")}
             scrollRef={scrollRef}
           />
        )}
        {view === "debrief" && <Debrief score={score} msgs={msgs} onRetry={start} onBack={() => setView("chat")} />}
      </div>
    </main>
  );
}

/* ───────────── Intro stack: 4 slides ───────────── */

function IntroStack({ onStart }: { onStart: () => void }) {
  const [i, setI] = useState(0);
  const total = 5;

  return (
    <div className="min-h-screen flex flex-col px-5 pt-10 pb-7">
      {/* Progress dots */}
      <div className="flex items-center justify-between">
        <div className="text-[11px] tracking-[0.3em] text-muted-foreground uppercase">
          Practice · 01 · {String(i + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: total }).map((_, k) => (
            <div
              key={k}
              className={
                "h-1 rounded-full transition-all duration-300 " +
                (k === i ? "w-6 bg-ember" : k < i ? "w-3 bg-ember/40" : "w-3 bg-paper-deep")
              }
            />
          ))}
        </div>
      </div>

      {/* Stacked slide area */}
      <div className="relative flex-1 mt-6">
        <SlideShell visible={i === 0}>
          <SlideInfo />
        </SlideShell>
        <SlideShell visible={i === 1}>
          <SlideGoals />
        </SlideShell>
        <SlideShell visible={i === 2}>
          <SlideSkills />
        </SlideShell>
        <SlideShell visible={i === 3}>
          <SlidePortrait />
        </SlideShell>
        <SlideShell visible={i === 4}>
          <SlideBackground />
        </SlideShell>
      </div>

      {/* Nav buttons */}
      <div className="mt-6 flex items-center gap-3">
        {i > 0 ? (
          <button
            onClick={() => setI(i - 1)}
            className="flex-1 rounded-full border border-border bg-card py-3.5 text-sm font-medium active:scale-[0.99] transition"
          >
            上一页
          </button>
        ) : (
          <div className="flex-1" />
        )}
        {i < total - 1 && i !== 3 ? (
          <button
            onClick={() => setI(i + 1)}
            className="flex-[1.4] rounded-full bg-primary text-primary-foreground py-3.5 text-sm font-medium tracking-wide active:scale-[0.99] transition shadow-[0_8px_24px_-12px_oklch(0.22_0.025_55/0.5)]"
          >
            继续
          </button>
        ) : i === 3 ? (
          <button
            onClick={() => setI(i + 1)}
            className="flex-[1.4] rounded-full bg-primary text-primary-foreground py-3.5 text-sm font-medium tracking-wide active:scale-[0.99] transition shadow-[0_8px_24px_-12px_oklch(0.22_0.025_55/0.5)]"
          >
            查看孩子背景信息
          </button>
        ) : (
          <button
            onClick={onStart}
            className="flex-[1.4] rounded-full bg-primary text-primary-foreground py-3.5 text-sm font-medium tracking-wide active:scale-[0.99] transition shadow-[0_8px_24px_-12px_oklch(0.22_0.025_55/0.5)]"
          >
            轻轻叩门
          </button>
        )}
      </div>
      <p className="mt-3 text-center text-[8px] text-muted-foreground"> 
        本工具仅为亲子沟通训练模拟<br />
        不具备心理诊疗、抑郁诊断功能，不能替代精神科医生、持证心理咨询师专业服务<br />
        用户对话数据仅本地临时存储，不对外共享任何用户内容
      </p>
    </div>
  );
}

function SlideShell({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div
      className={
        "absolute inset-0 transition-all duration-500 " +
        (visible ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-3 pointer-events-none")
      }
    >
      {children}
    </div>
  );
}

function SlideInfo() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="text-[11px] tracking-[0.3em] text-ember uppercase">本环节</div>
      <h1 className="mt-2 text-[28px] font-semibold leading-tight">
        和一个不开口的孩子<br />说第一句话。
      </h1>
      <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">
        这是一个不限时的沟通练习。你会扮演陈晓的妈妈——
        在她又一次没出来吃饭的傍晚，站到她房间门口。
      </p>

      <div className="mt-5 rounded-2xl bg-card border border-border p-4 space-y-3">
        <Row k="你的角色" v="陈晓的妈妈" />
        <Row k="沟通形式" v="文字或语音输入" />
        <Row k="陈晓画像" v="有轻度抑郁症的青春期初三女生" />
        <Row k="关键分值" v="情绪值 ≥ 85 (优秀)；情绪值 ≤ 15 (预警)" />
      </div>

      <div className="mt-4 rounded-2xl bg-paper-deep/60 border border-dashed border-border p-4">
        <p className="text-[12px] text-muted-foreground leading-relaxed">
          没有「正确答案」。但每一句话都会让她离你更近一点，或更远一点——
          你会即时看到她的情绪值在动。
        </p>
      </div>
    </div>
  );
}

function SlideGoals() {
  const goals = [
    { n: "01", t: "练习「叩门」", d: "学会用第一句低压力的话让孩子愿意继续待在对话里——而不是迅速关门。" },
    { n: "02", t: "练习「接住情绪」", d: "把焦点从行为换到感受。明确表示看见「累」，而不是「不去学校」。" },
    { n: "03", t: "练习「开放式交流」", d: "用开放式问题引导，不是「审讯式」的追问，而是「我想更了解你」的好奇。" },
    { n: "04", t: "练习「建立同盟」", d: "在给任何建议之前，先找到可以肯定的点，明确传递「我们是一伙的，不是你对我错」。" },
  ];
  return (
    <div className="h-full overflow-y-auto">
      <div className="text-[11px] tracking-[0.3em] text-ember uppercase">本轮目标</div>
      <h1 className="mt-2 text-[26px] font-semibold leading-tight">你要带走的四件事：</h1>
      <p className="mt-3 text-[13px] text-muted-foreground leading-relaxed">
        这不是关于「治好她」的练习，是关于「她愿不愿意继续跟你说话」的练习。
      </p>
      <ol className="mt-5 space-y-3">
        {goals.map((g) => (
          <li key={g.n} className="rounded-2xl bg-card border border-border p-4">
            <div className="flex items-start gap-3">
              <span className="font-display text-ember text-lg font-semibold tabular-nums">{g.n}</span>
              <div>
                <div className="font-display text-[15px] font-semibold">{g.t}</div>
                <div className="mt-1 text-[12.5px] text-muted-foreground leading-relaxed">{g.d}</div>
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SlideSkills() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="text-[11px] tracking-[0.3em] text-ember uppercase">技巧速记</div>
      <h1 className="mt-2 text-[26px] font-semibold leading-tight">五个反直觉的小动作：</h1>

      <div className="mt-5 space-y-3">
        <Tip
          ok="妈妈看到你还没出来，有点担心你。"
          bad="饭都凉了，你这样下去身体怎么受得了？"
          note="起点从「你」开始，不是从「饭」开始。"
        />
        <Tip
          ok="妈妈听到了，你现在很难受。"
          bad="妈妈理解你，但学还是要上的。"
          note="验证之后停住，不接「但是」。"
        />
        <Tip
          ok="你希望妈妈现在做什么？"
          bad="你就是不想去上学，对吗？"
          note="问感受，不是复述行为；开放式优先。"
        />
        <Tip
          ok="今晚出来跟我坐一会儿，不说话也行。"
          bad="明天能不能去学校待半天？"
          note="颗粒度小到她现在就能点头。"
        />
        <Tip
          ok="你可以说不，妈妈真的不勉强。"
          bad="不去的话你就自己承担后果。"
          note="「不」也是安全的，才是真选择。"
        />
      </div>
    </div>
  );
}

function SlidePortrait() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="text-[11px] tracking-[0.3em] text-ember uppercase">你要见的人</div>
      <h1 className="mt-2 text-[26px] font-semibold leading-tight">
        陈晓
      </h1>

      <div className="mt-4 rounded-2xl overflow-hidden border border-border shadow-sm">
        <img
          src={chenXiaoImg}
          alt="陈晓坐在床上低头看着画本"
          width={1024}
          height={1024}
          className="w-full aspect-square object-cover"
        />
        <div className="bg-card px-4 py-3">
          <div className="font-display text-base font-semibold">陈晓 · 16 · 初三</div>
        </div>
      </div>

      <section className="mt-4 rounded-2xl bg-card border border-border p-4">
        <div className="text-[11px] font-medium tracking-wider text-ember uppercase">情绪值 · Trust</div>
        <div className="mt-1.5 text-[13px] leading-relaxed text-foreground/85">
          不是「她有多抑郁」的分数，是「她此刻愿不愿意继续待在这段对话里」。
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[{ v: "35", l: "起始" }, { v: "15", l: "预警" }, { v: "85", l: "优秀" }].map((s) => (
            <div key={s.l} className="rounded-xl bg-paper-deep py-2">
              <div className="font-display text-xl font-semibold">{s.v}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{s.l}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SlideBackground() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="text-[11px] tracking-[0.3em] text-ember uppercase">你需要知道的事</div>
      <h1 className="mt-2 text-[26px] font-semibold leading-tight">
        关于陈晓：
      </h1>

      <div className="mt-5 space-y-3">
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="text-[12px] font-medium tracking-wider text-ember uppercase">基本信息</div>
          <div className="mt-2 space-y-2 text-[13px] text-foreground/85">
            <p>· 陈晓，16岁，初三学生</p>
            <p>· 轻度抑郁</p>
            <p>· 性格内向，自尊心强</p>
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="text-[12px] font-medium tracking-wider text-ember uppercase">兴趣与特点</div>
          <div className="mt-2 space-y-2 text-[13px] text-foreground/85">
            <p>· 画画是她唯一觉得「自己不是废物」的出口</p>
            <p>· 话少，不善于表达情绪</p>
            <p>· 渴望被理解，但又害怕被否定</p>
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="text-[12px] font-medium tracking-wider text-ember uppercase">心理状态与创伤史</div>
          <div className="mt-2 space-y-2 text-[13px] text-foreground/85">
            <p>· 低落、麻木为主，走进教室莫名烦躁，对一切提不起劲</p>
            <p>· 因为有被敷衍、否定的记忆，对寻求帮助产生习得性无助</p>
            <p>· 考试失利后，数学老师当堂说：“这种题目都不会做，你还想考什么学校，简直是太笨了。”</p>
            <p>· 跟妈妈说过“不想去学校”“想画画”，妈妈总说“你就是压力大”“没人喜欢上学”“画画不能当饭吃”</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] tracking-wider text-muted-foreground uppercase shrink-0">{k}</span>
      <span className="text-[13px] text-foreground/90 text-right">{v}</span>
    </div>
  );
}

function Tip({ ok, bad, note }: { ok: string; bad: string; note: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-3.5">
      <div className="flex items-start gap-2 text-[13px]">
        <span className="text-sage shrink-0">✓</span>
        <span>{ok}</span>
      </div>
      <div className="mt-1.5 flex items-start gap-2 text-[13px] text-muted-foreground line-through decoration-ember/50">
        <span className="text-ember no-underline shrink-0">✕</span>
        <span>{bad}</span>
      </div>
      <div className="mt-2 text-[11.5px] text-ember/90 leading-relaxed">{note}</div>
    </div>
  );
}

/* ───────────── Chat ───────────── */

function Chat({
  score,
  msgs,
  input,
  setInput,
  sendFree,
  isLoading,
  ledger,
  setLedger,
  onPickOption,
  turn,
  usedFreeInput,
  onExit,
  onBackToDebrief,
  scrollRef,
}: {
  score: number;
  msgs: Msg[];
  input: string;
  setInput: (v: string) => void;
  sendFree: () => void;
  isLoading: boolean;
  ledger: any;
  setLedger: (v: any) => void;
  onPickOption: (opt: Option) => void;
  turn: number;
  usedFreeInput: boolean;
  onExit: () => void;
  onBackToDebrief: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const warn = score <= ALERT && score > MELT;
  const goodWarning = score >= GOOD && score < PASS;
  const showOptions = turn < TURN_OPTIONS.length && !isLoading && !usedFreeInput;
  const currentOptions = showOptions ? TURN_OPTIONS[turn] : null;
  const ended = score >= PASS || score <= MELT;
  const showDebriefButton = score >= GOOD || score <= MELT;

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="px-5 pt-4 pb-3 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex items-center justify-between">
          <button onClick={onExit} className="text-xs text-muted-foreground tracking-wider">
            ← 结束
          </button>
          <div className="text-xs text-muted-foreground tracking-[0.2em] uppercase">陈晓的房间</div>
          <div className="w-10" />
        </div>
        <EmotionBar score={score} />
        {warn && (
          <div className="mt-2 text-[11px] text-ember font-medium animate-in fade-in">
            · 陈晓开始退缩了 ·
          </div>
        )}
        {goodWarning && (
          <div className="mt-2 text-[11px] text-sage font-medium animate-in fade-in">
            · 陈晓感到被理解，她愿意说更多 ·
          </div>
        )}
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-5 pb-20">
        <SceneCard />
        {msgs.map((m) => (m.who === "parent" ? <ParentBubble key={m.id} m={m} /> : <ChenBubble key={m.id} m={m} />))}
        {isLoading && <Typing />}
        {ended && (
          <div className="text-center text-[12px] text-muted-foreground italic py-3">
            {score >= PASS ? "· 你们之间，门开了一道缝（请点击右下方按钮查看报告） ·" : "· 她合上了画本，没再看你（请点击右下方按钮查看报告） ·"}
          </div>
        )}
        {goodWarning && (
          <div className="text-center text-[11px] text-sage/80 font-medium py-2">
            · 对话很成功 ·<br />
            · 你可以选择继续对话至满分，或随时点击右下角按钮查看报告 ·
          </div>
        )}
      </div>

      {/* 返回报告浮动按钮（优化版设计） */}
      {showDebriefButton && (
        <div className="fixed bottom-24 right-4 z-50">
          <button
            onClick={onBackToDebrief}
            // 样式调整：bg-card(白/暗色面板底) + border + text-ember(品牌色图标) + 强化阴影(shadow-xl)
            className="size-12 rounded-full bg-card border border-border text-ember shadow-xl flex items-center justify-center active:scale-95 transition hover:bg-accent/50"
            aria-label="查看分析报告"
            title="查看分析报告"
          >
            {/* 替换为了 📊 图表样式的 SVG，更符合“报告”语义 */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </button>
        </div>
      )}

      {/* Suggestions */}
      {currentOptions && !ended && (
        <div className="px-4 pb-2 pt-1">
          <div className="text-[10.5px] tracking-[0.25em] uppercase text-muted-foreground mb-2">
            · 前 {TURN_OPTIONS.length} 轮 · 试试看 ·
          </div>
          <div className="space-y-2">
            {currentOptions.map((opt) => (
              <button
                key={opt.label}
                onClick={() => onPickOption(opt)}
                className="w-full text-left rounded-2xl border border-border bg-card hover:bg-paper-deep/60 active:scale-[0.99] transition px-3.5 py-2.5"
              >
                <div className="flex items-center gap-2 text-[10.5px] tracking-wider text-ember uppercase">
                  {opt.label}
                </div>
                <div className="mt-1 text-[13px] text-foreground/90 leading-relaxed">{opt.text}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <Composer
        input={input}
        setInput={setInput}
        sendFree={sendFree}
        isLoading={isLoading}
        turn={turn}
        sendOption={onPickOption}
        usedFreeInput={usedFreeInput}
        ended={ended}
        score={score}
      />
    </div>
  );
}

/* ───────────── 方案 A：兼容微信 SDK 版本的 Composer ───────────── */

function Composer({
  input,
  setInput,
  sendFree,
  isLoading,
  turn,
  sendOption,
  usedFreeInput,
  ended,
  score,
}: {
  input: string;
  setInput: (v: string) => void;
  sendFree: () => void;
  isLoading: boolean;
  turn: number;
  sendOption: (o: Option) => void;
  usedFreeInput: boolean;
  ended: boolean;
  score: number;
}) {
  const [listening, setListening] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const recRef = useRef<any>(null);

  const SR = useMemo(() => {
    if (typeof window === "undefined") return null;
    return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
  }, []);

  // 核心：判断是否在微信内置浏览器内
  const isWechat = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /MicroMessenger/i.test(navigator.userAgent);
  }, []);

  function toggleVoice() {
    // 1. 微信环境处理逻辑
    if (isWechat) {
      const wx = (window as any).wx;
      if (!wx) {
        alert("微信环境未就绪");
        return;
      }

      if (listening) {
        setListening(false);
        wx.stopRecord({
          success: function (res: any) {
            const localId = res.localId;
            // 微信的核心接口：将刚录好的音频转成文字
            wx.translateVoice({
              localId: localId,
              isShowProgressTips: 1, // 显示微信官方的“正在识别”Loading
              success: function (translationRes: any) {
                const result = translationRes.translateResult; // 识别出的文字
                if (result) {
                  // 去掉末尾微信可能自带的句号
                  const cleanResult = result.replace(/[。]$/, "");
                  setInput((input ? input + " " : "") + cleanResult);
                }
              },
              fail: function () {
                alert("微信语音识别失败");
              }
            });
          }
        });
      } else {
        // 激活音频上下文补丁（防止部分iOS微信音频通道阻塞）
        if ((window as any).AudioContext || (window as any).webkitAudioContext) {
          const ctx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
          if (ctx.state === 'suspended') ctx.resume();
        }
        
        wx.startRecord({
          success: () => setListening(true),
          cancel: () => alert("用户拒绝了麦克风授权")
        });

        wx.onVoiceRecordEnd({
          complete: (res: any) => {
            setListening(false);
            alert("已达微信单次录音 60 秒上限");
          }
        });
      }
      return;
    }

    // 2. 传统浏览器环境（你原有的 Web Speech API 逻辑）
    if (!SR) {
      setUnsupported(true);
      setTimeout(() => setUnsupported(false), 2000);
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }

    // 🚨 修复 iOS 偶发性无法唤醒麦克风的补丁
    if ((window as any).AudioContext || (window as any).webkitAudioContext) {
      const audioCtx = new ((window as any).AudioContext || (window as any).webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }

    const rec = new SR();
    rec.lang = "zh-CN";
    rec.interimResults = true;
    rec.continuous = false;
    let base = input;

    rec.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      setInput((base ? base + " " : "") + final + interim);
      if (final) base = (base ? base + " " : "") + final;
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <footer className="border-t border-border bg-card px-3 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      {unsupported && (
        <div className="text-[11px] text-ember text-center mb-2">当前浏览器不支持语音输入</div>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={toggleVoice}
          aria-label="语音输入"
          disabled={ended}
          className={
            "shrink-0 size-11 rounded-full grid place-items-center border transition active:scale-95 " +
            (listening
              ? "bg-ember text-paper border-ember animate-pulse"
              : "bg-paper-deep border-border text-foreground/70 hover:text-foreground") +
            (ended ? " opacity-50 cursor-not-allowed" : "")
          }
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="3" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
        <textarea
          style={{ fontSize: "16px" }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendFree();
            }
          }}
          placeholder={ended ? (score >= PASS ? "恭喜通关，请点击右下方按钮查看报告" : "对话已结束，请点击右下方按钮查看报告") : turn >= 5 || usedFreeInput ? "自由输入" : "对陈晓说一句话…"}
          rows={1}
          className={`flex-1 resize-none rounded-2xl bg-paper-deep px-4 py-2.5 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-ember/40 max-h-32 ${ended ? "opacity-50 cursor-not-allowed" : ""}`}
          disabled={ended}
        />
        <button
          onClick={sendFree}
          disabled={!input.trim() || isLoading || ended}
          className={`shrink-0 size-11 rounded-full bg-primary text-primary-foreground grid place-items-center disabled:opacity-30 active:scale-95 transition ${ended ? "opacity-50 cursor-not-allowed" : ""}`}
          aria-label="发送"
        >
          {isLoading ? "…" : "发送"}
        </button>
      </div>
    </footer>
  );
}

function EmotionBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  // 颜色分段：≤15 红色(预警)，16-84 橙色，≥85 绿色(优秀/通关)
  const hue = pct <= ALERT ? "var(--ember)" : pct < GOOD ? "var(--ember-soft)" : "var(--sage)";
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground">情绪值</div>
        <div className="font-display text-lg font-semibold tabular-nums" style={{ color: hue as string }}>
          {pct}
          <span className="text-xs text-muted-foreground font-sans"> / 100</span>
        </div>
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-paper-deep overflow-hidden relative">
        {/* 预警线 ALERT=15 */}
        <div className="absolute top-0 bottom-0 w-px bg-ember/40" style={{ left: "15%" }} />
        {/* 优秀线 GOOD=85 */}
        <div className="absolute top-0 bottom-0 w-px bg-sage/40" style={{ left: "85%" }} />
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, var(--ember), ${hue})` }}
        />
      </div>
    </div>
  );
}

function SceneCard() {
  return (
    <div className="rounded-2xl border border-border bg-card/70 px-4 py-3 text-[12px] text-muted-foreground leading-relaxed italic">
      傍晚六点半。陈晓房间的门虚掩着，灯亮着。她坐在床上，画本摊在膝盖上。你端着一杯水，站在门口。
    </div>
  );
}

function ParentBubble({ m }: { m: Msg }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[82%] rounded-2xl rounded-br-md bg-primary text-primary-foreground px-4 py-2.5 text-[14px] leading-relaxed shadow-sm">
        {m.text}
      </div>
    </div>
  );
}

function ChenBubble({ m }: { m: Msg }) {
  const positive = (m.delta ?? 0) > 0;
  const negative = (m.delta ?? 0) < 0;
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="size-8 rounded-full overflow-hidden bg-paper-deep border border-border shrink-0">
          <img src={chenXiaoImg} alt="陈晓" className="w-full h-full object-cover" />
        </div>
        <div className="max-w-[82%]">
          <div className="text-[11px] text-muted-foreground mb-1">陈晓</div>
          <div className="rounded-2xl rounded-bl-md bg-card border border-border px-4 py-2.5 text-[14px] leading-relaxed">
            {m.parens && <span className="text-muted-foreground italic">（{m.parens}）</span>}
            {m.parens && " "}
            {m.text}
          </div>
        </div>
      </div>
      {typeof m.delta === "number" && (
        <div className="ml-10 max-w-[82%] rounded-xl bg-paper-deep/70 border border-border/60 px-3 py-2">
          <div className="flex items-center gap-2 text-[11px]">
            <span
              className={
                "font-display font-semibold tabular-nums " +
                (positive ? "text-sage" : negative ? "text-ember" : "text-muted-foreground")
              }
            >
              {m.delta > 0 ? "+" : ""}
              {m.delta}
            </span>
            <span className="text-muted-foreground">→ 情绪值 {m.scoreAfter}</span>
            {m.stage && <span className="ml-auto text-[10px] tracking-wider uppercase text-muted-foreground/80">{m.stage}</span>}
          </div>
          <div className="mt-1 text-[12px] text-foreground/75 leading-relaxed">{m.explain}</div>
        </div>
      )}
    </div>
  );
}

function Typing() {
  return (
    <div className="flex items-end gap-2">
      <div className="size-8 rounded-full overflow-hidden bg-paper-deep border border-border shrink-0">
        <img src={chenXiaoImg} alt="" className="w-full h-full object-cover" />
      </div>
      <div className="rounded-2xl rounded-bl-md bg-card border border-border px-4 py-3 flex gap-1">
        <Dot /> <Dot delay="0.15s" /> <Dot delay="0.3s" />
      </div>
    </div>
  );
}
function Dot({ delay = "0s" }: { delay?: string }) {
  return (
    <span
      className="block size-1.5 rounded-full bg-muted-foreground/60 animate-bounce"
      style={{ animationDelay: delay, animationDuration: "1.2s" }}
    />
  );
}

/* ───────────── Debrief (richer, per 6.2 spec) ───────────── */

function Debrief({ score, msgs, onRetry, onBack }: { score: number; msgs: Msg[]; onRetry: () => void; onBack: () => void }) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reportFetched = useRef(false);

  // visitedStages 由后端根据 msgs 内容自行判断

  useEffect(() => {
    if (reportFetched.current) return;
    reportFetched.current = true;
    async function loadReport() {
      try {
        setLoading(true);
        setError(null);
        const reportData = await generateReport(score, msgs);
        setReport(reportData);
      } catch (e) {
        setError("报告加载失败，请检查网络连接");
        console.error("Failed to load report:", e);
      } finally {
        setLoading(false);
      }
    }
    loadReport();
  }, []);

  // Fallback content when loading or error
  if (loading) {
    return (
      <div className="min-h-screen px-5 pt-10 pb-8 flex flex-col items-center justify-center">
        <div className="animate-pulse text-muted-foreground">正在生成报告...</div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="min-h-screen px-5 pt-10 pb-8 flex flex-col">
        <div className="text-xs tracking-[0.3em] uppercase text-muted-foreground">Debrief · 复盘</div>
        <h2 className="mt-2 text-2xl font-semibold">报告加载失败</h2>
        <div className="mt-6 rounded-2xl bg-card border border-border p-5">
          <p className="text-[14px] text-ember">{error}</p>
          <button
            onClick={() => {
              setLoading(true);
              setError(null);
              generateReport(score, msgs)
                .then(setReport)
                .catch((e) => setError("重试失败"))
                .finally(() => setLoading(false));
            }}
            className="mt-4 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  // Use report data or fallback to static content if API returns unexpected format
  const r = report!;
  const passed = score >= PASS;
  const melted = score <= MELT;
  const good = score >= GOOD && score < PASS;

  return (
    <div className="min-h-screen px-5 pt-10 pb-8 flex flex-col">
      <div className="text-xs tracking-[0.3em] uppercase text-muted-foreground">Debrief · 复盘</div>
      <h2 className="mt-2 text-2xl font-semibold">本轮你走到了这里</h2>

      {/* Final score card */}
      <div className="mt-6 rounded-2xl bg-card border border-border p-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[11px] tracking-[0.2em] uppercase text-muted-foreground">最终情绪值</div>
            <div className="font-display text-5xl font-semibold mt-1 tabular-nums" style={{ color: passed || good ? "var(--sage)" : "var(--ember)" }}>
              {score}
            </div>
          </div>
          <div className="text-right text-[12px] text-muted-foreground max-w-[55%]">
            {passed ? "通关 · 她坐到了你旁边" : melted ? "熔断 · 她关上了门" : good ? "优秀 · 你的话让她感到被理解" : "未结束 · 你提前离开了"}
          </div>
        </div>
        <div className="mt-4 h-1.5 w-full rounded-full bg-paper-deep overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-ember to-sage transition-all duration-1000"
            style={{ width: `${Math.max(score, 4)}%` }}
          />
        </div>
      </div>

      {/* 1 · 陈晓的内心独白 */}
      <Section label="01 · 陈晓的内心独白">
        <p className="text-[14px] leading-relaxed italic text-foreground/85">
          {r.monologue}
          <br />
          <span className="not-italic text-muted-foreground text-[12px]">—— 陈晓</span>
        </p>
      </Section>

      {/* 2 · 整体感受 */}
      <Section label="02 · 整体感受">
        <p className="text-[13.5px] leading-relaxed text-foreground/85">{r.overall}</p>
      </Section>

      {/* 3 · 本轮走到了哪里 */}
      <Section label="03 · 本轮走到了哪里">
        <p className="text-[13.5px] leading-relaxed text-foreground/85">{r.reachedLabel}</p>
        {r.stageFeedback.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {r.stageFeedback.map((sf) => (
              <span key={sf.stage} className="text-[11px] px-2 py-1 rounded-full bg-ember/10 border border-ember/40 text-ember">
                {sf.stage}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* 4 · 具体反馈 */}
      <Section label="04 · 具体反馈">
        {r.stageFeedback.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">还没走到可反馈的阶段。再试一次吧。</p>
        ) : (
          <div className="space-y-4">
            {r.stageFeedback.map((stageData) => (
              <div key={stageData.stage}>
                <div className="text-[12.5px] font-display font-semibold text-ember">{stageData.stage}</div>
                <ul className="mt-1.5 space-y-1.5 text-[13px] leading-relaxed text-foreground/85">
                  {stageData.items.map((it, i) => (
                    <li key={i}>{it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* 5 · 两件事 */}
      <Section label="05 · 本轮最值得带走的两件事">
        <div className="space-y-2.5 text-[13px] leading-relaxed">
          <div className="rounded-xl bg-sage/10 border border-sage/30 px-3 py-2.5">
            <span className="mr-1">🏅</span>这次做到了：{r.bestTake}
          </div>
          <div className="rounded-xl bg-ember/10 border border-ember/30 px-3 py-2.5">
            <span className="mr-1">🎯</span>下次重点练习：{r.nextFocus}
          </div>
        </div>
      </Section>

      {/* 6 · 鼓励 */}
      <section className="mt-4 rounded-2xl bg-paper-deep/60 border border-dashed border-border p-4">
        <p className="text-[12.5px] text-muted-foreground leading-relaxed">{r.encourageFinal}</p>
      </section>

      <div className="mt-7 flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-full border border-border bg-card py-3.5 text-sm font-medium"
        >
          查看回顾
        </button>
        <button
          onClick={onRetry}
          className="flex-1 rounded-full bg-primary text-primary-foreground py-3.5 text-sm font-medium"
        >
          重新练习
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl bg-card border border-border p-5">
      <div className="text-[11px] tracking-[0.2em] uppercase text-ember">{label}</div>
      <div className="mt-2.5">{children}</div>
    </section>
  );
}
