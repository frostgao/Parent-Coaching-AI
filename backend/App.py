import os
import json
from openai import OpenAI
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import re as _re
import random
from dotenv import load_dotenv

# ============================================================
# 1. 配置 API Key
# ============================================================
load_dotenv()
API_KEY = os.getenv("DASHSCOPE_API_KEY")
client = OpenAI(
    api_key=API_KEY,
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)

# ============================================================
# 2. 清洗解包工具与导入外部prompt文件
# ============================================================
def extract_text(content):
    if content is None:
        return ""
    if isinstance(content, list):
        return "".join([extract_text(item) for item in content])
    if isinstance(content, dict):
        if "text" in content:
            return extract_text(content["text"])
        return str(content)
    
    # 处理字符串格式
    s = str(content).strip()
    # 检测是否为伪装成字符串的字典
    if (s.startswith("{") and s.endswith("}")) or "type': 'text'" in s or 'type": "text"' in s:
        try:
            import ast
            parsed = ast.literal_eval(s)
            if isinstance(parsed, dict) and "text" in parsed:
                return extract_text(parsed["text"])
        except Exception:
            try:
                parsed = json.loads(s)
                if isinstance(parsed, dict) and "text" in parsed:
                    return extract_text(parsed["text"])
            except Exception:
                pass
    return s

def load_system_prompt():
    prompt_path = os.path.join(os.path.dirname(__file__), "prompt.md")
    if not os.path.exists(prompt_path):
        return "你是一个16岁的抑郁症女孩陈晓。请用冷漠的语气回答。"
    with open(prompt_path, "r", encoding="utf-8") as f:
        return f.read()

SYSTEM_PROMPT = load_system_prompt()

def load_scoring_criteria():
    path = os.path.join(os.path.dirname(__file__), "new_criteria.md")
    if not os.path.exists(path):
        return "（评分标准文件未找到）"
    with open(path, "r", encoding="utf-8") as f:
        return f.read()
    
SCORING_CRITERIA = load_scoring_criteria()      

def load_recommendation():
    path = os.path.join(os.path.dirname(__file__), "recommendation.md")
    if not os.path.exists(path):
        return "（文件未找到，参考评分标准）"
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

RECOMMENDATION = load_recommendation()

def load_judge_1():
    path = os.path.join(os.path.dirname(__file__), "judge_prompt_1.md")
    if not os.path.exists(path):
        return "（文件未找到，参考评分标准）"
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

judge_1 = load_judge_1()

def load_judge_2():
    path = os.path.join(os.path.dirname(__file__), "judge_prompt_2.md")
    if not os.path.exists(path):
        return "（文件未找到，参考评分标准）"
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

judge_2 = load_judge_2()

def load_judge_3():
    path = os.path.join(os.path.dirname(__file__), "judge_prompt_3.md")
    if not os.path.exists(path):
        return "（文件未找到，参考评分标准）"
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

judge_3 = load_judge_3()

# ============================================================
# 3. 设定裁判提示词 JUDGE_PROMPT 和账本管理
# ============================================================
JUDGE_PROMPT_1 = judge_1

JUDGE_PROMPT_2 = judge_2

JUDGE_PROMPT_3 = judge_3

def judge_agent(user_message, history, ledger, current_score=35):
    """两步裁判：第一步识别，第二步综合输出"""
    
    # 计算每个分组的总得分和上限，只显示有得分的分组
    group_summaries = []
    for group_name, group_limit in GROUP_LIMITS.items():
        group_earned = get_group_earned(ledger, group_name)
        if group_earned > 0:
            group_summaries.append(f"{group_name}: 已得{group_earned}分 / 上限{group_limit}分")
    ledger_summary = "\n".join(group_summaries) if group_summaries else "暂无得分记录"
    
    history_text = _format_history_for_judge(history)
    
    # ── 第一步：识别维度、质量、连贯性 ──
    step1_input = f"""
## 对话历史
{history_text}

## 家长最新输入
{user_message}

## 当前账本
{ledger_summary}
"""
    
    try:
        r1 = client.chat.completions.create(
            model="qwen-turbo",
            messages=[
                {"role": "system", "content": JUDGE_PROMPT_1},
                {"role": "user", "content": step1_input}
            ],
            temperature=0.1,
            max_tokens=150,
        )
        raw1 = r1.choices[0].message.content.strip().replace("```json","").replace("```","").strip()
        step1 = json.loads(raw1)
        print(f"[裁判第一步]: {step1}")
    except Exception as e:
        step1 = {"dimension": "未识别", "quality": "neutral", "coherence": "normal"}
        print(f"[裁判第一步异常]: {e}")
    
    # ── Python账本预计算（传给第二步参考） ──
    dim = step1.get("dimension", "未识别")
    quality = step1.get("quality", "neutral")
    coherence = step1.get("coherence", "normal")
    safety = step1.get("safety", "safe")
    if safety == "unsafe":
        print("⚠️监测到边界内容，已自动熔断")
        return
    
    # 根据质量和连贯性预判delta
    if coherence == "pivot":
        pre_delta = -6
    elif coherence == "irrelevant":
        pre_delta = -3
    elif quality == "good" and dim in ledger:
        info = ledger[dim]
        group = info.get("group", "")
        group_limit = GROUP_LIMITS.get(group, 20)
        group_earned = get_group_earned(ledger, group)
        remaining = group_limit - group_earned
        if remaining <= 0:
            pre_delta = 0
        else:
            # 从scoring里取对应分值（简化：直接用group_limit的比例估算）
            pre_delta = min(group_limit, remaining)
    elif quality == "bad":
        pre_delta = -3
    else:
        pre_delta = 0
    
    ledger_note = ""
    if dim in ledger:
        info = ledger[dim]
        dim_type = info.get("type", "normal")
        # 特殊维度有 max 字段
        if dim_type == "special_bonus" and info["earned"] >= info["max"]:
            ledger_note = f"注意：{dim}维度已触顶，实际得分为0，但家长行为本身请正常评价"
        elif info["consecutive"] >= 2:
            ledger_note = f"注意：{dim}维度已连续{info['consecutive']}次，请在reason中提示推进"
    
    # ── 第二步：综合输出reason和actor_instruction ──
    step2_input = f"""
## 第一步识别结果
维度：{dim}
质量：{quality}
连贯性：{coherence}

## 账本备注
{ledger_note if ledger_note else "无特殊备注"}

## 对话历史
{history_text}

## 家长最新输入
{user_message}

## 当前情绪值与档位约束
当前分数：{current_score}分
账本状态：{ledger_summary}
"""
    
    try:
        r2 = client.chat.completions.create(
            model="qwen-turbo",
            messages=[
                {"role": "system", "content": JUDGE_PROMPT_2},
                {"role": "user", "content": step2_input}
            ],
            temperature=0.6,
            max_tokens=200,
        )
        raw2 = r2.choices[0].message.content.strip().replace("```json","").replace("```","").strip()
        step2 = json.loads(raw2)
        print(f"[裁判第二步]: {step2}")
    except Exception as e:
        step2 = {"reason": "系统评分异常，维持原分", "actor_instruction": "保持当前状态，给最低限度回应"}
        print(f"[裁判第二步异常]: {e}")
    
    # ── 整合最终结果 ──
    # 初始化final_delta和depth确保安全
    final_delta = 0
    depth = step1.get("depth", "shallow")
    
    # delta根据连贯性覆盖
    if coherence == "pivot":
        final_delta = -6
    elif coherence == "irrelevant":
        final_delta = -3
    else:
        # 增强的模糊匹配维度名，支持各种引号和控制字符
        import re
        matched_dim = dim
        if dim not in ledger:
            # 清理字符串：移除所有类型引号、空白字符、控制字符
            clean_dim = re.sub(r'["“”\'‘’\s\n\t\r]+', '', dim)
            for key in ledger.keys():
                clean_key = re.sub(r'["“”\'‘’\s\n\t\r]+', '', key)
                # 精确匹配而非子字符串匹配
                if clean_dim == clean_key:
                    matched_dim = key
                    break

        # 根据 depth 计算得分
        score_map = {"deep": 8, "medium": 4, "shallow": 2}
        
        if quality == "good" and matched_dim in ledger:
            final_delta = score_map.get(depth, 1)
            dim = matched_dim  # 直接修正dim变量
        elif quality == "bad":
            final_delta = -3
        else:
            final_delta = 0
    
    # 动态计算stage值（基于current_score）
    # 16-45分：stage 0（画画防御期）
    # 46-60分：stage 1（校园试探期）
    # 61-80分：stage 2（自我暴露期）  
    # 81-100分：stage 3（成功通关）
    if current_score <= 45:
        stage = 0
    elif current_score <= 60:
        stage = 1
    elif current_score <= 80:
        stage = 2
    else:
        stage = 3

    return {
        "dimension": dim,
        "stage": stage,
        "quality": quality,
        "coherence": coherence,
        "depth": depth,
        "score_delta": final_delta,
        "reason": step2.get("reason", ""),
        "actor_instruction": step2.get("actor_instruction", "保持当前状态")
    }

def generate_recommendation(history, ledger, remaining_dims):
    """
    当用户触顶/连击时，根据账本状态和对话上下文生成具体推荐话术。
    - remaining_dims: 已经计算好的未触顶维度列表
    - 基于 remaining_dims 中的维度生成自然的得分话术
    """
    if not remaining_dims:
        # 所有维度都触顶了，返回通用建议
        return "继续保持，妈妈和陈晓的联结已经建立得很好了。"
    
    # 计算每个分组的总得分和上限，只显示有得分的分组
    group_summaries = []
    for group_name, group_limit in GROUP_LIMITS.items():
        group_earned = get_group_earned(ledger, group_name)
        if group_earned > 0:
            group_summaries.append(f"{group_name}: 已得{group_earned}分 / 上限{group_limit}分")
    ledger_summary = "\n".join(group_summaries) if group_summaries else "暂无得分记录"
    
    history_text = _format_history_for_judge(history)
    
    prompt_input = f"""
## 对话历史
{history_text}

## 未触顶的维度（Python已计算）：{', '.join(remaining_dims)}

## 账本状态
{ledger_summary}

## 你的任务：
1. 查看 remaining_dim 中列出的剩余维度
2. 分析当前对话上下文（最重要参考近1轮），查看“话术不同类型所适应的对话场景”标准中每个剩余维度的适用场景，选择一个最合适给用户作为下一轮话术的维度
3. 参考这个维度的话术示例，根据上下文语境生成一句自然的推荐得分话术（不得照搬示例话术）
4. **输出只要这一句话，不要带类似“妈妈：”的前缀，直接输出话语**

"""
    
    try:
        r = client.chat.completions.create(
            model="qwen-turbo",
            messages=[
                {"role": "system", "content": JUDGE_PROMPT_3},
                {"role": "user", "content": prompt_input}
            ],
            temperature=0.7,
            max_tokens=150,
        )
        recommended_answer = r.choices[0].message.content.strip()
        print(f"[推荐话术生成]: {recommended_answer}")
        return recommended_answer
    except Exception as e:
        print(f"[推荐话术生成异常]: {e}")
        # 降级方案：从静态字典中随机抽取
        recommended_answer_dict = {
            "发现信号": "妈妈注意到你今天一回家就进房间了，我不催你，就想让你知道我在。",
            "低压力叩门": "不用现在说话，妈妈就是想让你知道我在。你想聊的时候门是开着的。",
            "情绪命名": "你现在感觉很累、很绝望，什么都不想做，妈妈懂这种感觉。",
            "不接但是": "你说去学校会让你很难受——妈妈听到了。就这样。",
            "开放式提问": "你现在感觉怎么样？",
            "反映核心感受": "你说的是——不是不想学，是走进那个教室就会感到非常难受，不知道为什么，就是受不了。",
            "承认自身盲区": "我一直以为只要你回去上学就解决了，我没有想过你在里面承受的是什么。",
            "给予肯定": "你能坚持画画这件事，妈妈觉得真的很厉害。",
            "委婉建议": "今天不用做任何事，就问你一件事——你想不想让妈妈陪你在房间里坐一会儿，不说话也行？",
            "给出选择权": "你愿意的话就出来，不愿意也没关系，妈妈不会催你。"
        }
        return random.choice(recommended_answer_dict.get(remaining_dims[0], "继续保持。"))

def update_ledger(ledger, judge_result, history):
    dim = judge_result.get("dimension", "未识别")
    coherence = judge_result.get("coherence", "normal")
    delta = judge_result.get("score_delta", 0)
    reason = judge_result.get("reason", "")
    quality = judge_result.get("quality", "neutral")
    depth = judge_result.get("depth", "shallow")

    # ── 话锋突变/无关：直接扣分不进账本 ──
    if coherence in ("pivot", "irrelevant"):
        return ledger, delta, reason

    if dim not in ledger:
        return ledger, delta, reason

    info = ledger[dim]
    dim_type = info.get("type", "normal")

    # ── 特殊维度：不接但是 ──
    if dim_type == "special_penalty":
        if quality == "bad":
            info["consecutive"] = 0
            return ledger, -7, reason
        return ledger, 0, reason

    # ── 特殊维度：承认自身盲区 ──
    if dim_type == "special_bonus":
        if quality == "good" and info["earned"] < info["max"]:
            score_map = {"deep": 6, "medium": 4, "shallow": 2}
            actual = score_map.get(depth, 2)
            actual = min(actual, info["max"] - info["earned"])
            info["earned"] += actual
            info["consecutive"] += 1
            return ledger, actual, reason
        elif info["earned"] >= info["max"]:
            return ledger, 0, f"{reason}（承认盲区已得满分）"
        return ledger, 0, reason

    # ── 常规维度 ──
    group = info.get("group", "")
    group_limit = GROUP_LIMITS.get(group, 20)
    group_earned = get_group_earned(ledger, group)

    if quality == "bad":
        info["consecutive"] = 0
        return ledger, -3, reason

    if quality == "good":
        # 阶梯加分
        score_map = {"deep": 8, "medium": 4, "shallow": 2}
        raw_delta = score_map.get(depth, 1)

        # 检查分组上限
        remaining_group = group_limit - group_earned
        if remaining_group <= 0:
            # 分组已满，检查是否需要推荐
            info["consecutive"] += 1
            need_rec = info["consecutive"] >= 2
            if need_rec:
                untouched = get_underscored_groups(ledger)
                if untouched:
                    recommended = generate_recommendation(history, ledger, untouched)
                    return ledger, 0, f"{reason}……可以尝试说说：\"{recommended}\""
            return ledger, 0, f"{reason}（{group}已达上限，可以推进其他方向）"

        actual = min(raw_delta, remaining_group)
        info["earned"] += actual
        info["consecutive"] += 1

        # 检查是否有未触及维度，在reason里提示
        untouched = get_underscored_groups(ledger)
        if len(untouched) >= 3:
            # 还有很多维度未触及时，加一句轻提示
            return ledger, actual, reason

        return ledger, actual, reason

    # neutral
    info["consecutive"] += 1
    if info["consecutive"] >= 3:
        info["consecutive"] = 0
        untouched = get_underscored_groups(ledger)
        if untouched:
            recommended = generate_recommendation(history, ledger, untouched)
            return ledger, 0, f"{reason}……可以尝试说说：\"{recommended}\""
    return ledger, 0, reason


def _format_history_for_judge(history):
    """将历史记录精准清洗格式化为裁判可读的纯文本，隔绝杂质"""
    lines = []
    for msg in history:
        if hasattr(msg, "get"):
            role = msg.get("role", "")
            content = msg.get("content", "")
        else:
            role = getattr(msg, "role", "")
            content = getattr(msg, "content", "")
            
        # 🎯 核心修复 1：利用清洗器强行滤掉 Gradio 字典和历史嵌套字符串
        clean_content = extract_text(content)
        
        if role == "user":
            lines.append(f"妈妈：{clean_content}")
        elif role == "assistant":
            clean = clean_content.replace("【熔断结束】", "").replace("【成功收尾】", "")
            lines.append(f"陈晓：{clean}")
    return "\n".join(lines[-10:])

# ============================================================
# 4. 核心解算与状态机逻辑
# ============================================================
def _get_scene_by_score(score):
    if score <= 45:
        return "坐在书桌前低头画画，画具散落一桌，没有抬头"
    elif score <= 60:
        return "放下铅笔，坐着发呆，手边还有未画完的草稿"
    elif score <= 75:
        return "转身面对妈妈，手里还拿着笔，身体语言开始松动"
    elif score <= 85:
        return "放下笔，靠着床头，不再刻意回避眼神接触"
    else:
        return "从书桌旁站起来，走向妈妈所在的方向"

def _get_motivation_by_score(score):
    if score <= 45:
        return "只谈眼前的画纸，任何试图引导你聊学校或情绪的话，用最短的字怼回去"
    elif score <= 60:
        return "可以回应感受类的话，但不主动展开，更不主动提学校"
    elif score <= 75:
        return "可以被动透露学校相关的碎片，但只说一句，等家长接"
    elif score <= 85:
        return "可以说完整的事件，但仍由家长的问题引出，不自己发起话题"
    else:
        return "可以主动说，情绪已经足够安全"

def chat_engine(message, history, current_score, ledger):
    # 防御性修复：如果ledger为空，使用默认账本
    if not ledger or len(ledger) == 0:
        ledger = init_ledger()
    if current_score <= 0:
        return history, current_score, ledger, "❌ 对话已熔断。陈晓进入关闭状态，请点击重新开始。"
    if current_score >= 100:
        return history, current_score, ledger, "🎉 恭喜你！陈晓已对你彻底敞开心扉，请查看复盘报告。"

    user_message_str = extract_text(message)

    try:
        # ── 1. 裁判先跑 ──
        judge_result = judge_agent(user_message_str, history, ledger, current_score)
        print(f"\n[AI 原始裁判输出]: {judge_result}")

        # ── 2. 账本更新，计算新分数 ──
        ledger, final_delta, final_reason = update_ledger(ledger, judge_result, history)
        new_score = max(10, min(100, current_score + final_delta))
        print(f"[账本调整得分变动]: {final_delta} 分 | 修正解析: {final_reason}")

        # ── 2.5 根据 quality 添加 emoji 前缀 ──
        quality = judge_result.get("quality", "neutral")
        emoji_map = {
            "good": "🌟",
            "neutral": "💡",
            "bad": "⚠️"
        }
        emoji_prefix = emoji_map.get(quality, "")
        final_reason = f"{emoji_prefix} {final_reason}"

        # ── 3. 预警线检测 ──
        warning_text = ""
        if new_score <= 25 and current_score > 25:
            warning_text = "\n\n⚠️ 陈晓开始退缩了，请尝试调整方式"

        # ── 4. 状态报告 ──
        delta_display = f"+{final_delta}" if final_delta > 0 else str(final_delta)
        status_report = (
            f"### 📈 本轮情绪值变动\n"
            f"**{current_score} → {new_score}（{delta_display}分）**\n\n"
            f"### 💡 解析\n"
            f"{final_reason}{warning_text}"
        )

        # ── 5. 演员Agent：只收actor_instruction，不再收场景映射 ──
        actor_instruction = judge_result.get("actor_instruction", "保持当前状态，给最低限度回应")
        actor_scene = _get_scene_by_score(new_score)  # 只用于括号动作参考
        
        last_chen = ""
        for msg in reversed(history):
            if msg.get("role") == "assistant":
                last_chen = extract_text(msg.get("content", ""))
                break

        scene_injection = (
            f"\n\n【本轮行动指令 - 最高优先级，严格执行】\n"
            f"【上一轮你说的话】：{last_chen}\n"
            f"【连续性要求】：你的态度和情绪必须从上一轮延续，不能突然收回或转变，但措辞和句式不能与上一轮重复或同义重复\n"
            f"当前情绪值：{new_score}分，当前场景：{actor_scene}\n"
            f"本轮你必须做的事（做的动作和说的话）：{actor_instruction}\n"
            f"格式铁律：(一个动作不超过15字) 一句台词不超过30字，只能一行，严禁换行\n"
        )

        # 构建演员消息列表
        messages = [{"role": "system", "content": SYSTEM_PROMPT}]
        for msg in list(history):
            if hasattr(msg, "get"):
                raw_content = msg.get("content", "")
                role = msg.get("role", "assistant")
            elif hasattr(msg, "content"):
                raw_content = msg.content
                role = msg.role
            else:
                raw_content = str(msg)
                role = "assistant"
            
            # 🎯 核心修复 1：同样在这里对演员输入历史进行全面文本清洗脱壳，确保不包含任何字典残余
            clean_content = extract_text(raw_content)
            clean_content = clean_content.replace("【熔断结束】", "").replace("【成功收尾】", "")
            messages.append({"role": role, "content": clean_content})

        messages.append({"role": "user", "content": user_message_str + scene_injection})

        completion = client.chat.completions.create(
            model="qwen-plus",
            messages=messages,
            temperature=0.7,
            frequency_penalty=0.6,
            presence_penalty=0.4,
            max_tokens=80,
        )

        reply = completion.choices[0].message.content.strip()
        # 💡 终极防御：即便演员因为惯性吐出了被包裹的字典字串，在此强行给它抠干净，确保塞进 Gradio 的永远是优美文本
        reply = extract_text(reply)
        print(f"--- 演员返回 ---\n{reply}\n---------------")

        if new_score <=0:
            reply = "【熔断结束】" + reply
        elif new_score >= 100:
            reply = "【成功收尾】" + reply

        updated_history = list(history)
        updated_history.append({"role": "user", "content": user_message_str})
        updated_history.append({"role": "assistant", "content": reply})
        return updated_history, new_score, ledger, status_report

    except Exception as e:
        import traceback
        traceback.print_exc()
        updated_history = list(history)
        updated_history.append({"role": "user", "content": user_message_str})
        updated_history.append({"role": "assistant", "content": f"❌ 系统连接异常: {str(e)}"})
        return updated_history, current_score, ledger, "服务器连接失败，请检查网络或 API Key。"

# ============================================================
# 5. 账本初始化
# ============================================================
def init_ledger():
    return {
        # ── 特殊维度（独立处理）──
        "不接但是":     {"type": "special_penalty", "earned": 0, "consecutive": 0},
        "承认自身盲区": {"type": "special_bonus",   "earned": 0, "max": 6, "consecutive": 0},

        # ── 常规维度分组 ──
        # 靠近（上限20）
        "发现信号":     {"type": "normal", "group": "靠近", "earned": 0, "consecutive": 0},
        "低压力叩门":   {"type": "normal", "group": "靠近", "earned": 0, "consecutive": 0},

        # 倾听&共情（上限45）
        "情绪命名":     {"type": "normal", "group": "倾听&共情", "earned": 0, "consecutive": 0},
        "反映核心感受": {"type": "normal", "group": "倾听&共情", "earned": 0, "consecutive": 0},
        "开放式提问":   {"type": "normal", "group": "倾听&共情", "earned": 0, "consecutive": 0},

        # 同盟肯定组（上限15）
        "给予肯定":     {"type": "normal", "group": "同盟肯定组", "earned": 0, "consecutive": 0},

        # 引导（上限15）
        "委婉建议":     {"type": "normal", "group": "引导", "earned": 0, "consecutive": 0},
        "给出选择权":   {"type": "normal", "group": "引导", "earned": 0, "consecutive": 0},
    }

GROUP_LIMITS = {
    "靠近": 20,
    "倾听&共情": 45,
    "同盟肯定组": 15,
    "引导":     15,
}

def get_group_earned(ledger, group_name):
    """计算某分组当前已得总分"""
    return sum(
        v["earned"] for v in ledger.values()
        if v.get("group") == group_name
    )

def get_underscored_groups(ledger):
    """返回每个分组还未触及（earned==0）的维度列表，用于推荐"""
    untouched = []
    for dim, info in ledger.items():
        if info.get("type") == "normal" and info["earned"] == 0:
            untouched.append(dim)
    return untouched


# ============================================================
# 6. FastAPI 接口层 （含报告）
# ============================================================

api = FastAPI()
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    history: list
    current_score: int
    ledger: dict

@api.post("/chat")
def chat_api(req: ChatRequest):
    updated_history, new_score, updated_ledger, status = chat_engine(
        req.message, req.history, req.current_score, req.ledger
    )
    reply = ""
    for msg in reversed(updated_history):
        if isinstance(msg, dict) and msg.get("role") == "assistant":
            reply = extract_text(msg.get("content", ""))
            break
    delta_match = _re.search(r'([+\-]\d+)分', status)
    delta = int(delta_match.group(1)) if delta_match else 0
    reason_match = _re.search(r'### 💡 解析\n(.+?)(?:\n|$)', status)
    reason = reason_match.group(1).strip() if reason_match else ""
    return {
        "reply": reply,
        "new_score": new_score,
        "ledger": updated_ledger,
        "delta": delta,
        "reason": reason
    }

@api.get("/reset")
def reset_api():
    return {"initial_score": 35, "ledger": init_ledger()}

class ReportRequest(BaseModel):
    score: int
    msgs: list

@api.post("/report")
def report_api(req: ReportRequest):
    msgs_text = "\n".join([
        f"{'妈妈' if m.get('who')=='parent' else '陈晓'}: {m.get('text','')}"
        for m in req.msgs if m.get('text')
    ])
    
    report_prompt = f"""你是专业家庭心理咨询教练，基于以下对话记录生成复盘报告。

## 对话记录
{msgs_text}

## 最终情绪值
{req.score}

## 评分维度定义（用于分析对话）
### 阶段1：察觉与叩门（满分17分）
- 发现信号（最高分5分）：家长的回应起点是「孩子的状态」还是「任务/规则」？
- 低压力叩门（最高分12分）：家长的回复是否给孩子留了退路？

### 阶段2：接住情绪（满分15分）
- 情绪命名（最高分8分）：家长说的是「你感到……」还是「你在做……/你应该……」？
- 不接「但是」（最高分7分）：验证情绪后是否立刻转向「但你还是要……」

### 阶段3：深挖与理解（满分13分）
- 开放式提问（最高分7分）：问的问题能否用「嗯」「没有」「不知道」一个词回答？
- 反映核心感受（最高分6分）：家长是在复述孩子说的内容，还是在自己解释？

### 阶段4：建立同盟（满分11分）
- 承认自身盲区（最高分6分）：家长有没有承担责任？
- 给予肯定（最高分5分）：肯定是真实的还是工具性的？

### 阶段5：给出空间与小步骤（满分9分）
- 委婉建议（最高分5分）：建议是否小、今天、可选、不需要提前改变状态？
- 给出选择权（最高分4分）：「说不」真的被允许吗？

## 分析任务
1. 阅读对话，识别家长在哪些维度使用了有效话术（参考上述维度定义）
2. 从对话中判断本轮走到了哪个阶段（reachedLabel）
3. 为每个有效使用过的维度生成 stageFeedback：
   - 每个维度的 items 有2条：🌟表示做得好的点（基于对话内容），⚠️表示改进建议
   - 避免重复或空泛的话，要结合具体对话内容

## 输出格式（严格JSON格式，不要有多余的字段或解释）
{{
  "monologue": "陈晓第一人称内心独白1-2句，基于她的回复风格",
  "overall": "教练视角总结，不超过30字，概括整体表现",
  "reachedLabel": "本轮走到了哪里（如「阶段1：察觉与叩门」或「阶段2：接住情绪」或「阶段3：深挖与理解」等）",
  "stageFeedback": [
    {{"stage": "维度中文名", "items": ["🌟结合对话的具体优点", "⚠️结合对话的具体改进建议"]}}
  ],
  "bestTake": "本轮最值得带走的2件事 - 做到了什么（不超过25字）",
  "nextFocus": "下次重点练习（不超过25字）",
  "encourageFinal": "鼓励话语（不超过20字）"
}}

## 注意事项
- reachedLabel 必须从「阶段1：察觉与叩门」「阶段2：接住情绪」「阶段3：深挖与理解」「阶段4：建立同盟」「阶段5：给出空间与小步骤」中选择
- stageFeedback 只为对话中实际体现的维度生成，不要凭空添加
- 每条 feedback 要具体，结合对话中的实际内容
- 如果某个维度完全没有体现，不要出现在 stageFeedback 中"""

    response = client.chat.completions.create(
        model="qwen-max",
        messages=[{"role": "user", "content": report_prompt}],
        temperature=0.7,
        max_tokens=1000,
    )
    raw = response.choices[0].message.content.strip().replace("```json","").replace("```","")
    result = json.loads(raw)
    
    # 确保 stageFeedback 格式正确
    if "stageFeedback" not in result:
        result["stageFeedback"] = []
    
    return result


# ============================================================
# 7. 后端启动与测试端口‘/’
# ============================================================

@api.get("/")
def read_root():
    return {"Hello": "World"}
    
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "18003"))
    reload = os.getenv("UVICORN_RELOAD", "0").strip().lower() in {"1", "true", "yes", "on"}
    uvicorn.run("App:api", host="0.0.0.0", port=port, reload=reload)