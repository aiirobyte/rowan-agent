# LLM 调用流程设计文档

本文档描述 Rowan Agent 中 Skill 和 Phase 的 LLM 调用流程设计，参考 pi 的实现模式。

## 概述

Rowan Agent 支持两种调用模式：

1. **工具模式（Tool Mode）**：LLM 主动调用 READ 工具读取 SKILL.md/PHASE.md 内容
2. **程序化模式（Programmatic Mode）**：开发者通过 `agent.skill()` 和 `agent.phase()` API 调用

## Skill 调用流程

### 工具模式（LLM 发起）

```
┌─────────────────────────────────────────────────────────────┐
│                      系统提示                                │
├─────────────────────────────────────────────────────────────┤
│ The following skills provide specialized instructions.      │
│ Read the full skill file when the task matches its          │
│ description.                                                │
│                                                             │
│ <available_skills>                                          │
│   <skill>                                                   │
│     <name>code-review</name>                                │
│     <description>Review code for best practices...</description> │
│     <location>/path/to/.rowan/skills/code-review/SKILL.md</location> │
│   </skill>                                                  │
│ </available_skills>                                         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      LLM 决策                               │
├─────────────────────────────────────────────────────────────┤
│ 1. LLM 分析用户请求                                          │
│ 2. 匹配 skill 描述                                           │
│ 3. 决定调用 READ 工具                                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   LLM 调用 READ 工具                         │
├─────────────────────────────────────────────────────────────┤
│ Tool: read                                                  │
│ Args: { path: "/path/to/.rowan/skills/code-review/SKILL.md" } │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   工具执行结果                                │
├─────────────────────────────────────────────────────────────┤
│ <skill name="code-review" location="/path/to/SKILL.md">     │
│ References are relative to /path/to/.rowan/skills/code-review │
│                                                             │
│ [SKILL.md 内容]                                             │
│ </skill>                                                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   LLM 使用 Skill 内容                        │
├─────────────────────────────────────────────────────────────┤
│ LLM 根据 skill 指令执行任务                                  │
└─────────────────────────────────────────────────────────────┘
```

### 程序化模式（开发者发起）

```typescript
// 开发者代码
const skillContent = agent.skill("code-review", "请重点检查安全性");

// 返回格式化的内容
// <skill name="code-review" location="/path/to/SKILL.md">
// References are relative to /path/to/.rowan/skills/code-review
//
// [SKILL.md 内容]
// </skill>
//
// 请重点检查安全性
```

### 实现细节

#### 1. Skill 发现与加载

```typescript
// packages/agent/src/harness/skills.ts

export async function loadAllSkills(workspace?: WorkspacePaths): Promise<Skill[]> {
  // 扫描 .rowan/skills/ 目录
  // 加载每个子目录中的 SKILL.md
  // 返回 Skill[] 包含 name, description, filePath, baseDir, content
}

export function formatSkillInvocation(skill: Skill, additionalInstructions?: string): string {
  // 格式化为 <skill> XML 块
  return `<skill name="${skill.name}" location="${skill.filePath}">
References are relative to ${skill.baseDir}.

${skill.content}
</skill>`;
}
```

#### 2. Agent 自动发现

```typescript
// packages/agent/src/agent.ts

private async discoverResources(context: AgentContext) {
  // 1. 发现 .rowan/phases/ 中的 phases
  // 2. 发现 .rowan/skills/ 中的 skills
  // 3. 合并 CLI 提供的 phases/skills
  return { phases, skills };
}
```

#### 3. 系统提示构建

```typescript
// packages/agent/src/harness/context/section-formatter.ts

export function buildSkillsDescription(skills: Array<{name, description, filePath}>): string {
  // 生成 <available_skills> XML 块
  // 仅包含 name, description, location
  // 不包含 content（LLM 通过 READ 工具读取）
}
```

## Phase 调用流程

### 工具模式（自动注入）

```
┌─────────────────────────────────────────────────────────────┐
│                   进入新 Phase                               │
├─────────────────────────────────────────────────────────────┤
│ 1. Agent 检测到 phase 切换                                   │
│ 2. 加载 PHASE.md 文件                                        │
│ 3. 注入 content 作为 tool_result                             │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   注入 Phase 内容                            │
├─────────────────────────────────────────────────────────────┤
│ Message Role: tool                                          │
│ Tool Use ID: phase_<phase_id>                               │
│ Content: [PHASE.md body]                                    │
│                                                             │
│ 例如:                                                       │
│ {                                                           │
│   type: "tool_result",                                      │
│   toolUseId: "phase_plan",                                  │
│   content: "You are in the Plan phase...",                  │
│   isError: false                                            │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   LLM 看到 Phase 内容                        │
├─────────────────────────────────────────────────────────────┤
│ LLM 在消息历史中看到 phase 内容                              │
│ 根据 phase 指令执行任务                                      │
└─────────────────────────────────────────────────────────────┘
```

### 程序化模式（开发者发起）

```typescript
// 开发者代码
const phaseContent = await agent.phase("plan");

// 返回 phase 内容
// "You are in the Plan phase..."
```

### 实现细节

#### 1. Phase 发现与加载

```typescript
// packages/agent/src/harness/phases/loader.ts

export async function loadPhases(workspace?: WorkspacePaths): Promise<PhaseRegistry> {
  // 扫描 .rowan/phases/ 目录
  // 加载每个子目录中的 PHASE.md
  // 返回 PhaseRegistry 包含 phases Map 和 entryPhaseId
}
```

#### 2. Phase 内容注入

```typescript
// packages/agent/src/loop/runners.ts

if (enteringNewPhase && phase.filePath) {
  const { body } = await loadMarkdown(phase.filePath);
  if (body) {
    const content: LlmContentPart[] = [{
      type: "tool_result",
      toolUseId: `phase_${phase.id}`,
      content: body,
      isError: false,
    }];
    const msgId = messageManager.start("tool", content, { phase: phase.id });
    await messageManager.end(msgId);
  }
}
```

#### 3. Phase 路由

```typescript
// LLM 通过 route 工具切换 phase
// 例如: route("verify", "计划完成，进入验证阶段")
```

## 数据流图

```
┌─────────────────────────────────────────────────────────────┐
│                      Agent 启动                             │
├─────────────────────────────────────────────────────────────┤
│ 1. discoverResources()                                      │
│    - 扫描 .rowan/phases/ → PhaseRegistry                    │
│    - 扫描 .rowan/skills/ → Skill[]                          │
│ 2. 构建系统提示                                              │
│    - <available_skills> 列表                                │
│    - 工具列表                                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   runPhasedLoop()                            │
├─────────────────────────────────────────────────────────────┤
│ for each phase:                                             │
│   1. 注入 PHASE.md 内容作为 tool_result                      │
│   2. 构建 PhaseInput (tools, skills 过滤)                    │
│   3. 调用 LLM                                               │
│   4. 执行工具调用                                            │
│   5. 检查 route 工具调用                                     │
│   6. 切换到下一个 phase                                      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   LLM 工具调用                               │
├─────────────────────────────────────────────────────────────┤
│ - read: 读取文件（包括 SKILL.md）                            │
│ - bash: 执行命令                                             │
│ - route: 切换 phase                                          │
│ - thread: 创建子 agent                                       │
└─────────────────────────────────────────────────────────────┘
```

## API 参考

### agent.skill(name, additionalInstructions?)

获取格式化的 skill 内容供 LLM 使用。

**参数：**
- `name: string` - Skill 名称
- `additionalInstructions?: string` - 可选的附加指令

**返回：** `string` - 格式化的 skill 内容

**异常：** 如果 skill 不存在，抛出 `Error`

**示例：**
```typescript
const content = agent.skill("code-review", "请重点检查安全性");
```

### agent.phase(name)

获取 phase 内容。

**参数：**
- `name: string` - Phase 名称

**返回：** `Promise<string>` - Phase 内容，如果不存在返回空字符串

**示例：**
```typescript
const content = await agent.phase("plan");
```

## 配置

### .rowan/phases/

Phase 文件目录结构：
```
.rowan/
  phases/
    plan/
      PHASE.md          # Phase 内容和元数据
      index.ts          # 可选的 phase 执行代码
    verify/
      PHASE.md
```

PHASE.md 格式：
```markdown
---
name: Plan
description: 分析用户请求并创建结构化任务计划
entry: true
---

[Phase 内容]
```

### .rowan/skills/

Skill 文件目录结构：
```
.rowan/
  skills/
    code-review/
      SKILL.md          # Skill 内容和元数据
    testing/
      SKILL.md
```

SKILL.md 格式：
```markdown
---
name: code-review
description: Review code for best practices and security issues
---

[Skill 内容]
```

## 最佳实践

1. **Skill 设计**
   - 保持 description 简洁明确
   - 内容应包含完整的执行指令
   - 使用相对路径引用其他文件

2. **Phase 设计**
   - 每个 phase 应有明确的目标
   - 使用 route 工具进行 phase 切换
   - 保持 phase 内容简洁

3. **工具模式 vs 程序化模式**
   - 工具模式：适用于 LLM 自主决策
   - 程序化模式：适用于开发者控制流程
