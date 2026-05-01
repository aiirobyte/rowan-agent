# Rowan v0.2.0 Task Board

> 版本：v0.2.0
> 日期：2026-05-01
> 状态：已实现
> 范围：monorepo 拆包条件、首轮 package extraction、Workspace ACI seed

## 1. Status Legend

| Status | Meaning |
|---|---|
| done | 未开始 |
| doing | 进行中 |
| blocked | 阻塞 |
| done | 完成 |

## 2. Milestone Tasks

| ID | Milestone | Task | Type | Priority | Depends On | Status | Acceptance |
|---|---|---|---|---|---|---|---|
| V02-001 | M0 | 明确 v0.2.0 package dependency direction | docs | P0 | - | done | `agent` 无上游依赖，其他包依赖方向清晰 |
| V02-002 | M0 | 冻结 v0.0.0 public API export list | api | P0 | - | done | `agent/src/index.ts` 只导出稳定对象和类型 |
| V02-003 | M0 | 确认 trace schema v0.1.0 兼容策略 | trace | P0 | - | done | v0.2.0 不改变 `AgentEvent` 语义 |
| V02-004 | M0 | 建立 v0.2.0 release checklist | docs | P1 | V02-001 | done | `PLAN.md` 和 `TASKS.md` 均包含验收项 |
| V02-101 | M1 | 配置 Bun workspace | build | P0 | V02-002 | done | root `package.json` 包含 `workspaces`，root scripts 保持可用 |
| V02-102 | M1 | 新增 package scaffolds | build | P0 | V02-101 | done | `packages/agent/adapters/trace/aci/cli` 均有 `package.json` 和 `src/index.ts` |
| V02-103 | M1 | 建立 shared tsconfig | build | P1 | V02-102 | done | `tsconfig.base.json` 可被各 package 复用 |
| V02-104 | M1 | 移除 root compatibility entry 方案 | build | P0 | V02-102 | done | v0.2.0 不保留根 `src/index.ts` 兼容导出，只保留 root scripts |
| V02-201 | M2 | 迁移 agent 类型 | agent | P0 | V02-102 | done | `types.ts` 进入 `packages/agent`，测试通过 |
| V02-202 | M2 | 迁移 Agent / loop / session / task / verifier | agent | P0 | V02-201 | done | agent tests 通过 |
| V02-203 | M2 | 迁移 Tool protocol | agent | P0 | V02-201 | done | tools validation tests 通过 |
| V02-204 | M2 | 添加 agent package boundary test | test | P0 | V02-202 | done | `agent` 不 import 其他 Rowan package |
| V02-301 | M3 | 迁移 OpenAI-compatible adapter | adapter | P0 | V02-202 | done | mock fetch tests 通过 |
| V02-302 | M3 | 迁移 prompt builder / JSON extractor | adapter | P0 | V02-301 | done | prompt/json tests 通过 |
| V02-303 | M3 | 保持 config resolver 行为 | adapter | P0 | V02-301 | done | env/CLI precedence tests 通过 |
| V02-304 | M3 | 迁移 JSONL trace writer | trace | P0 | V02-202 | done | existing trace writer tests 通过 |
| V02-305 | M3 | 实现 JSONL trace reader | trace | P0 | V02-304 | done | 可读取 v0.1.0 JSONL events |
| V02-306 | M3 | 实现 trace inspect API | trace | P1 | V02-305 | done | 支持 list/read/filter events |
| V02-401 | M4 | 实现 WorkspaceContext | aci | P0 | V02-203 | done | root resolve 和权限字段测试通过 |
| V02-402 | M4 | 实现 `workspace.list` | aci | P0 | V02-401 | done | 可列 workspace 内文件，默认忽略 heavy dirs |
| V02-403 | M4 | 实现 `workspace.read` | aci | P0 | V02-401 | done | 可读取文件，限制最大输出 |
| V02-404 | M4 | 实现 `workspace.search` | aci | P0 | V02-401 | done | 可按文本搜索 workspace |
| V02-405 | M4 | 添加路径逃逸测试 | security | P0 | V02-402,V02-403 | done | `../` 和绝对路径逃逸被拒绝 |
| V02-406 | M4 | 设计 `workspace.diff` / `workspace.patch` | aci | P1 | V02-405 | done | 有接口和测试计划，默认不自动写入 |
| V02-407 | M4 | 设计 `workspace.bash` | aci | P1 | V02-405 | done | 执行命令走 execute 权限与 policy hook |
| V02-501 | M5 | 迁移 CLI 到 `packages/cli` | cli | P0 | V02-301,V02-304,V02-402 | done | `bun run rowan "hello"` 行为不变 |
| V02-502 | M5 | CLI 接入默认 Workspace ACI read-only tools | cli | P0 | V02-501,V02-404 | done | agent 可调用 list/read/search |
| V02-503 | M5 | 实现 `rowan trace list` | cli | P1 | V02-306,V02-501 | done | 可列出 `.rowan/runs` |
| V02-504 | M5 | 实现 `rowan trace show` | cli | P1 | V02-306,V02-501 | done | 可查看 run 事件摘要 |
| V02-601 | M6 | 清理旧 import 路径 | refactor | P0 | V02-501 | done | 源码不再依赖旧相对路径结构 |
| V02-602 | M6 | 删除迁移后的根 `src/` | refactor | P0 | V02-601 | done | runtime 源码全部位于 `packages/*/src` |
| V02-603 | M6 | 增加 package dependency check | test | P0 | V02-601 | done | CI/local test 可发现反向依赖 |
| V02-604 | M6 | 更新 README quickstart | docs | P1 | V02-501 | done | README 描述 monorepo 和 trace commands |
| V02-605 | M6 | 执行 release checklist | release | P0 | V02-602,V02-603,V02-604 | done | `bun test`、`bun run build`、CLI smoke 全通过 |

## 3. Release Checklist

- [x] `bun test`
- [x] `bun run build`
- [x] `bun run rowan "hello"`
- [x] `bun run rowan trace list`
- [x] `bun run rowan trace show <run-id-or-file>`
- [x] OpenAI-compatible mock tests pass after package extraction
- [x] Trace reader can parse v0.1.0 JSONL files
- [x] Workspace ACI read-only tools pass tests
- [x] Path traversal tests pass
- [x] Package dependency direction check passes
- [x] README / ROADMAP / ARCHITECTURE updated

## 4. Explicitly Out of v0.2.0

- [ ] Anthropic adapter
- [ ] Gemini adapter
- [ ] provider registry
- [ ] full trace replay
- [ ] fork from step
- [ ] eval runner
- [ ] workflow graph executor
- [ ] sub-agent
- [ ] Web UI
