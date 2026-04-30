# Rowan v0.1

> 版本：v0.1  
> 日期：2026-05-01  
> 状态：已实现，待真实 API 手动验收  
> 上游文档：`docs/ROADMAP.md`、`docs/v0/PLAN.md`

## 文档

| 文档 | 用途 |
|---|---|
| `docs/v0.1/PLAN.md` | v0.1 主计划，聚焦 OpenAI-compatible 真实模型接入 |
| `docs/v0.1/TASKS.md` | 可直接拆 issue 的任务表 |

## v0.1 目标

v0.1 在 v0 最简内核之上接入真实模型：

```text
Agent
  -> OpenAI-compatible StreamFn
  -> plan Task
  -> emit tool calls
  -> verify Outcome
```

## 快速验收

推荐本地开发时从 `.env.example` 创建 `.env`：

```bash
cp .env.example .env
```

然后在 `.env` 中填入：

```bash
ROWAN_OPENAI_BASE_URL=https://api.openai.com/v1
ROWAN_OPENAI_API_KEY=sk-...
ROWAN_MODEL=gpt-4.1-mini
```

也可以在当前 shell 中临时设置：

```bash
export ROWAN_OPENAI_BASE_URL="https://api.openai.com/v1"
export ROWAN_OPENAI_API_KEY="..."
export ROWAN_MODEL="..."
```

执行验收：

```bash
bun test
bun run build
bun run rowan "say hello"
bun run rowan --trace .rowan/runs/real.jsonl "use echo tool"
```

CLI 默认会把每次运行写入 `.rowan/runs/<YYYY-MM-DDTHHMMSS-CC+HH:MM>-run_<id>.jsonl`，例如 `.rowan/runs/2026-03-12T164018-22+08:00-run_12345678.jsonl`。
JSONL 内部事件 `ts` 使用同一个本地时间格式。
`--trace <path>` 只用于覆盖默认路径，例如固定写到 `.rowan/runs/real.jsonl`。

CLI 参数优先级高于环境变量，适合临时覆盖：

```bash
bun run rowan \
  --base-url https://api.openai.com/v1 \
  --api-key sk-... \
  --model gpt-4.1-mini \
  "say hello"
```
