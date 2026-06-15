# Agent-facing Tool 设计外部调研报告

**面向：MineMusic Stage Interface Tool Frame 外部参考**  
**日期：2026-06-14**  
**范围声明：本文不是 MineMusic Stage Interface Tool Frame 的最终 spec，也不替 MineMusic 做最终架构决策。本文只总结成熟 agent/tool/MCP/plugin 生态中的外部设计模式，并把它们转译成 MineMusic 可参考的设计维度。**

---

## 0. 结论摘要

成熟 agent-facing tool 体系的共同点不是“把函数暴露给 LLM”，而是把 tool 设计成 **agent-facing API contract**。这个 contract 通常包含：工具标识、自然语言用途说明、输入 schema、输出 schema、side-effect/权限注解、运行时策略、错误模型、示例、catalog/handbook、审计和测试提示。

最接近 MineMusic Stage Interface Tool Frame 的参考是 MCP。MCP server 通过 `tools/list` 让 client 发现工具，通过 `tools/call` 调用工具；每个工具包含 `name`、`title`、`description`、`inputSchema`、可选 `outputSchema` 和 `annotations`，调用结果可包含 `structuredContent`、`content` 与 `isError`。MCP 还明确要求服务端校验输入、访问控制、限流、输出清洗；客户端应给敏感操作做人类确认、显示输入、验证结果、设置超时并记录工具使用。来源：[MCP Tools specification, 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)。

OpenAI Apps SDK 把 tool 明确称为模型和 MCP server 之间的 contract，强调工具要“一件事做好”、输入显式、输出可预测，并建议把 read/write 工具拆开以便确认流程；同一份文档还强调发现主要由 metadata 驱动，需要写清 `use this when`、参数说明、输出形状、auth、rate limits、错误处理和测试 prompts。来源：[OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools)、[OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference)。

Anthropic 的 tool-use 文档和工程文章更直接说明了为什么这对 agent 有用：工具定义会进入模型上下文，名称、描述、schema 会影响模型是否选择工具、如何填参数；好的工具要写清“何时用、何时不用、参数含义、限制与 caveats”，返回高信号、稳定 ID、少量必要信息，并避免把每个 API endpoint 原样包成工具。来源：[Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)、[Anthropic Engineering: Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)。

GitHub MCP Server 展示了一个成熟 MCP server 在工程上的做法：用 toolsets 启用/禁用工具组，用 read-only mode 跳过写工具，用 OAuth scope filtering 隐藏无权限工具，用 CLI tool-search 搜索工具名、描述和输入参数名。GitHub 还在 changelog 中说明合并 Projects 工具把上下文 token 减少约 50%，并通过 OAuth scope filtering 减少工具 clutter 和不必要错误。来源：[GitHub MCP Server README](https://github.com/github/github-mcp-server)、[GitHub Changelog: MCP Server new Projects tools and OAuth scope filtering](https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/)。

LangChain、LlamaIndex、OpenAI Agents SDK、Google ADK、AutoGen、Pydantic AI、Semantic Kernel 等框架都支持“函数变工具”，但它们的共同警告是：函数名、docstring、type hints、参数描述会变成 agent 的选择依据。也就是说，docstring 不是普通开发注释，而是 agent 的操作说明。来源：[LangChain Tools](https://docs.langchain.com/oss/python/langchain/tools)、[LlamaIndex Tools](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/tools/)、[OpenAI Agents SDK Tools](https://openai.github.io/openai-agents-python/tools/)、[Google ADK Custom tools](https://adk.dev/tools-custom/)、[Semantic Kernel Plugins](https://learn.microsoft.com/en-us/semantic-kernel/concepts/plugins/)。

对 MineMusic 的直接启发是：Stage Interface Tool Frame 应避免把内部 service、provider SDK、数据库查询或 material/canonical/source 内部对象直接暴露为 LLM tool。更稳的参考方向是：Stage tool 作为 agent-facing 合约，只连接窄 application service / query service；返回 compact public output；显式声明 read/write/side-effect、权限、超时、错误和可继续操作的 public handles。

---

## 1. 调研对象与重点问题

本文调研对象分为四类：

1. **官方规范 / protocol**：MCP Tools、MCP Registry。
2. **主流 agent/tool 框架**：OpenAI Apps SDK、OpenAI Agents SDK、Anthropic Claude tools、LangChain、LlamaIndex、Semantic Kernel、Google ADK、AutoGen、Pydantic AI、CrewAI。
3. **成熟 MCP server 实例**：GitHub MCP Server。
4. **插件 / capability 生态经验**：toolsets、plugins、tool catalogs、metadata-driven discovery、权限过滤和上下文预算管理。

本文按以下问题提取设计信息：

- agent 如何知道有哪些 tool 可用？
- 每个 tool 如何告诉 agent 什么时候用、什么时候不用？
- 输入输出如何约束？
- side effect、权限、错误、超时如何表达？
- tool catalog / handbook / examples 是否存在，以及如何发挥作用？
- 哪些模式是跨项目通用的？
- 哪些做法是框架特有的？
- 哪些做法不适合 MineMusic 直接采用？

---

## 2. 外部项目与规范矩阵

### 2.1 MCP Tools Specification

| 维度 | 设计方式 | 为什么对 agent 有用 | 来源 |
|---|---|---|---|
| 可用工具发现 | Server 声明 `tools` capability；client 用 `tools/list` 请求工具列表；server 可声明 `listChanged` 表示工具列表可变。 | agent/client 不需要猜工具集合，也不需要把工具写死在 prompt 中；动态环境中可以刷新 catalog。 | [MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) |
| Tool 定义 | 每个工具有 `name`、`title`、`description`、`inputSchema`、可选 `outputSchema`、`annotations`。 | 名称和描述帮助模型选择工具；schema 限制参数；annotations 给 client/model 额外使用线索。 | [MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) |
| 调用协议 | `tools/call` 接收 `name` 和 `arguments`。 | 将 discovery 与 invocation 分开；模型选择工具后，运行时有统一调用入口。 | [MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) |
| 输出 | 结果可含 `structuredContent`、`content`、`isError`。如有 `outputSchema`，structured output 必须符合 schema。 | agent 可读取稳定结构化结果，而不是解析自由文本；错误可以进入对话循环并被模型修正。 | [MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) |
| 错误 | 协议错误和工具执行错误区分；工具执行错误返回 `isError: true`。 | agent 可以把业务错误作为 observation 处理，而不是把整个协议视为失败。 | [MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) |
| 安全 | 服务端必须校验输入、访问控制、限流、清洗输出；客户端应确认敏感操作、展示输入、验证结果、设置超时、记录使用。 | LLM tool use 的风险不只在 prompt；server/client 都要承担约束。annotations 不能替代服务端 enforcement。 | [MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) |

**对 MineMusic 的参考价值**：MCP 的工具定义字段可以作为 Stage Interface Tool Frame 的最小外部基准。特别是 `tools/list` + schema + `isError` + security guidance，对 MineMusic 的 tool discovery、handler boundary、错误可恢复性和 agent-facing handbook 都有直接参考价值。

**不宜直接照搬**：MCP 是 protocol，不会替应用定义领域边界。MineMusic 仍需自己决定哪些 domain capability 可以暴露为 Stage tool、哪些只能留在内部 application service 或 admin surface。

---

### 2.2 OpenAI Apps SDK / OpenAI Agents SDK

| 维度 | 设计方式 | 为什么对 agent 有用 | 来源 |
|---|---|---|---|
| Tool 作为 contract | OpenAI Apps SDK 明确说 tool 是 MCP server 与模型之间的 contract。 | 把 tool 设计从“函数调用”提升为“给模型看的稳定接口”，减少模型误选和误填参数。 | [OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools) |
| 一件事做好 | 建议每个 tool 做一个清晰任务，输入显式，输出可预测；read/write 拆分。 | 模型的 tool selection 是概率行为，职责越混杂，越容易误调用；read/write 拆分便于确认和权限控制。 | [OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools) |
| Metadata-first discovery | discovery 主要由 metadata 驱动：name、description、use-this-when、parameter annotations、global metadata。 | metadata 实际进入模型选择过程，决定模型何时调用工具。 | [OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools) |
| Side-effect hints | Apps SDK 使用 `readOnlyHint`、`destructiveHint`、`openWorldHint`、`idempotentHint` 等 annotations。 | agent/client 可以据此决定是否自动调用、是否确认、是否提示风险；但 server 仍要 enforce auth。 | [OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference)、[Build MCP server](https://developers.openai.com/apps-sdk/build/mcp-server) |
| Security schemes | 工具可声明 `securitySchemes`。 | agent/client 可知道工具是否需要 auth、OAuth scope 或其他安全上下文。 | [OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference) |
| 输出 schema | `registerAppTool` 示例包含 `inputSchema` 与 `outputSchema`。 | 工具结果可以稳定被模型和 UI 消费，避免自然语言解析。 | [OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference) |
| 函数工具 | OpenAI Agents SDK 可以从函数名、docstring、签名、type annotations、Pydantic model 生成 schema，并支持 timeout、错误处理。 | 开发体验好，但也意味着函数 docstring 和参数名会直接影响模型行为。 | [OpenAI Agents SDK Tools](https://openai.github.io/openai-agents-python/tools/) |

**对 MineMusic 的参考价值**：OpenAI 的文档很适合转成 Stage Interface Tool Frame 的 review checklist：tool 是否只有一个 job、是否拆分 read/write、metadata 是否足够、input/output schema 是否明确、是否声明 side-effect/auth/timeout/error/test prompts。

**不宜直接照搬**：Apps SDK 的 UI component / render tool 机制面向 ChatGPT App 形态。MineMusic 可以借鉴“data tool 与 rendering 分离”，但不应把 Stage Interface 的 domain output 绑定到某个 UI 组件模型。

---

### 2.3 Anthropic Claude Tool Use / Writing Tools for Agents

| 维度 | 设计方式 | 为什么对 agent 有用 | 来源 |
|---|---|---|---|
| Tool definition | 工具定义包含 name、description、input_schema、可选 input_examples。 | Claude 根据工具定义决定是否调用、如何生成参数；schema 和 examples 降低格式错误。 | [Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) |
| Description 指南 | description 应说明工具做什么、何时用、何时不用、参数含义、限制和 caveats。 | 对模型来说，description 是选择策略的一部分，不是人类文档装饰。 | [Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) |
| Tool choice | 支持 auto、any、tool、none 等策略。 | 调用策略可由系统控制：自动选择、强制用某工具、禁用工具。 | [Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) |
| Strict tool use | 支持 strict tool use。 | 对参数结构要求强的工具，可以更严格约束模型输出。 | [Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools) |
| 不包每个 endpoint | Anthropic 工程文章建议不要把每个 API endpoint 都包装成工具，应设计少量高价值工具并合并多步流程。 | 减少工具选择空间和上下文负担，避免模型在大量低层 endpoint 之间迷失。 | [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) |
| 高信号输出 | 建议返回高信号信息、稳定 identifiers、避免低层技术 ID；必要时提供简洁/详细 response format。 | 工具输出进入 agent 的后续推理；低信号和冗长输出会消耗 context 并诱导错误。 | [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) |
| Helpful errors | 工具错误应帮助 agent 修正调用。 | 如果错误可恢复，模型可以重新填参数或换工具；否则只能向用户暴露失败。 | [Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents) |

**对 MineMusic 的参考价值**：第一个只读音乐发现工具尤其需要 Anthropic 风格的 description：写清“用于找具体音乐候选，不用于音乐理论/一般传记/不需要候选结果的问题”。输出也应高信号、短、稳定、可继续操作。

**不宜直接照搬**：Anthropic 的 tool_choice 是模型 API 层能力；MineMusic Stage Interface 不一定需要同名字段，但需要同等概念：runtime 可以允许自动调用、强制只读工具、禁用写工具或按用户授权开放工具。

---

### 2.4 GitHub MCP Server

| 维度 | 设计方式 | 为什么对 agent 有用 | 来源 |
|---|---|---|---|
| Toolsets | Server 支持 `--toolsets` 启用/禁用工具组；README 明确说只启用需要的 toolsets 可减少 tool choice 数量和 context size。 | 不是所有工具都应随时暴露。减少工具集合可降低错误选择、节省上下文。 | [GitHub MCP Server README](https://github.com/github/github-mcp-server) |
| Read-only mode | `--read-only` 会跳过写工具。 | 同一 server 可在只读模式下安全接入 agent，适合审计、搜索、浏览等场景。 | [GitHub MCP Server README](https://github.com/github/github-mcp-server) |
| Tool allowlist | 可用 `--tools` 或 env 只开放指定工具。 | 精确控制 agent 可见工具集合，避免高风险工具进入模型上下文。 | [GitHub MCP Server README](https://github.com/github/github-mcp-server) |
| Tool search | CLI `tool-search` 按工具名、描述和输入参数名搜索工具。 | tool catalog 本身需要可查找；这类似 agent handbook 的工程版本。 | [GitHub MCP Server README](https://github.com/github/github-mcp-server) |
| OAuth scope filtering | 无对应 OAuth scope 的工具会被隐藏。GitHub 说明这减少 clutter 并防止权限错误。 | agent 不应看到当前无法调用的工具；权限过滤应影响 discovery，而不只是调用时报错。 | [GitHub Changelog](https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/) |
| Consolidated tools | GitHub 合并 Projects 工具后减少约 23,000 tokens / 50% tools context。 | 工具数量和工具描述本身就是上下文预算问题。合并相关操作可让 agent 更稳定。 | [GitHub Changelog](https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/) |
| Server identity | 可 override server name/title，帮助 agent 区分不同 server 实例。 | 多 server / 多账号环境中，工具来源需要稳定可区分。 | [GitHub MCP Server README](https://github.com/github/github-mcp-server) |

**对 MineMusic 的参考价值**：MineMusic 不应默认把所有 Stage tools 暴露给 agent。第一个阶段可以有 read-only toolset；后续 save/play/feedback/import/admin 要按权限、用户授权、side-effect policy 和 account state 过滤。toolset 与 read-only mode 是 Stage Interface Tool Frame 应考虑的维度。

**不宜直接照搬**：GitHub 的领域是代码托管，工具组天然按 GitHub API 分区。MineMusic 不应按 provider API 分 toolset，而应按 agent 任务和风险分组，例如 discovery/read、recommendation、user-state-write、playback/external-action、admin/internal。

---

### 2.5 LangChain / LlamaIndex

| 维度 | 设计方式 | 为什么对 agent 有用 | 来源 |
|---|---|---|---|
| 函数转 tool | LangChain 的 `@tool` 默认用函数 docstring 做描述，用 type hints 生成 input schema。 | 快速暴露工具，但函数名/docstring/type hints 会影响 agent 选择与参数生成。 | [LangChain Tools](https://docs.langchain.com/oss/python/langchain/tools) |
| 命名约束 | LangChain 建议工具名用兼容性好的 snake_case，避免空格和特殊字符。 | 多模型/多 provider 兼容；减少工具名解析问题。 | [LangChain Tools](https://docs.langchain.com/oss/python/langchain/tools) |
| Tool 是 agent API | LlamaIndex 明确说 tool 类似 API interface，但对象是 agent 不是 human；name 和 description 会强烈影响模型选择工具和参数。 | 这是 MineMusic 最需要吸收的观念：Stage tool contract 要为 agent 优化，而不是为内部开发者优化。 | [LlamaIndex Tools](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/tools/) |
| Tool metadata | LlamaIndex tool interface 包含 name、description、function schema 等 metadata。 | agent 可以通过 metadata 判断能力边界。 | [LlamaIndex Tools](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/tools/) |

**对 MineMusic 的参考价值**：可以借鉴“从 TypeScript types / JSON Schema / doc block 生成 handbook”的开发体验，但必须把生成物视为 agent-facing artifact，并通过 review/test 保证描述质量。

**不宜直接照搬**：不要把内部 application service 函数直接套 decorator 变成 Stage tool。内部函数通常面向工程调用，参数名、异常、返回值、side effect 都不适合直接给 LLM。

---

### 2.6 Semantic Kernel

| 维度 | 设计方式 | 为什么对 agent 有用 | 来源 |
|---|---|---|---|
| Plugin 是函数组 | Semantic Kernel 把 plugin 定义为可暴露给 AI app/service 的函数组。 | 工具通常应按领域组织，而不是散落的单函数集合。 | [Semantic Kernel Plugins](https://learn.microsoft.com/en-us/semantic-kernel/concepts/plugins/) |
| 语义描述 | 文档强调函数需要描述 input、output、side effects，否则 AI 可能无法正确调用。 | side effect 是模型选择和风险控制的一部分；不是代码实现细节。 | [Semantic Kernel Plugins](https://learn.microsoft.com/en-us/semantic-kernel/concepts/plugins/) |
| Retrieval vs automation | Semantic Kernel 区分 data retrieval / RAG 函数和 task automation 函数。 | 只读发现与写用户状态/执行播放应使用不同工具策略和确认策略。 | [Semantic Kernel Plugins](https://learn.microsoft.com/en-us/semantic-kernel/concepts/plugins/) |
| Agent-specific plugins | Agent 可以按角色拥有特定函数集合。 | MineMusic 可按 Stage、模式、用户授权或任务场景暴露不同 toolset。 | [Semantic Kernel Agent functions](https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-functions) |

**对 MineMusic 的参考价值**：Stage Interface tool 可以按 domain plugin / toolset 组织，但 tool 仍需声明 side effect 和 role。第一个只读音乐发现工具应归类为 retrieval/search，而不是 recommendation automation 或 user-state action。

**不宜直接照搬**：Semantic Kernel 的 plugin 更偏应用编排层；MineMusic 仍需保持 Stage Interface 与 domain/provider/storage 的边界，不应让 plugin 直接拿 full kernel/store。

---

### 2.7 Google ADK

| 维度 | 设计方式 | 为什么对 agent 有用 | 来源 |
|---|---|---|---|
| Tool 执行预定义逻辑 | ADK 说明 tool 是 agent 可用的功能，执行开发者定义的逻辑；tool 本身不 reason，LLM 决定何时调用、填什么参数。 | 这能避免把过多决策藏在 tool 内部，也避免 tool 假装 agent。 | [Google ADK Custom tools](https://adk.dev/tools-custom/) |
| Tool use flow | 模型先推理，再基于 docstring/available tools 选择工具，执行后把结果作为 observation，再继续响应。 | 工具输出必须适合作为 observation：短、结构化、可恢复。 | [Google ADK Custom tools](https://adk.dev/tools-custom/) |
| 函数 schema 生成 | ADK 可从函数名、docstring、参数、type hints、默认值生成 schema。缺少必填参数时向 LLM 返回错误以便修正。 | 输入校验错误应该模型可见、可修正。 | [Google ADK Function tools](https://adk.dev/tools-custom/function-tools/) |
| OpenAPI toolset | ADK 可从 OpenAPI spec 生成 tools，tool name 来自 operationId，description 来自 summary/description。 | OpenAPI 是 bootstrap 方式，但生成工具质量取决于 operationId/description，不自动等于 agent-friendly。 | [Google ADK OpenAPI tools](https://adk.dev/tools-custom/openapi-tools/) |
| Tool list in agent | LlmAgent 的 tools 列表可包含函数、BaseTool、AgentTool；LLM 使用名称、描述、参数 schema 判断调用。 | Stage Runtime 也需要一个明确、可过滤的 tools 列表。 | [Google ADK LLM agents](https://adk.dev/agents/llm-agents/) |
| Invocation state | ADK state 支持 `temp:` 这类 invocation-scoped state。 | MineMusic 的 provider candidate / search temporary result 适合 request/session scoped，不应默认变成 durable material。 | [Google ADK State](https://adk.dev/sessions/state/) |

**对 MineMusic 的参考价值**：ADK 的 “tool does not reason” 可以作为 Stage tool handler 的约束：handler 执行确定性 application service，不在内部做开放式 agent reasoning。`temp:` state 概念也支持 MineMusic 对只读发现候选和 request-scoped candidate relation 的思路。

**不宜直接照搬**：OpenAPI 自动生成 tool 很容易暴露内部 API 颗粒度，不适合直接作为 Stage Interface。MineMusic 可用 OpenAPI/schema 作为内部生成基础，但必须重写 agent-facing description、输出和 side-effect policy。

---

### 2.8 AutoGen / Pydantic AI / CrewAI

| 维度 | 设计方式 | 为什么对 agent 有用 | 来源 |
|---|---|---|---|
| AutoGen FunctionTool | 使用 description 和 type annotations 告诉 LLM 何时、如何使用工具；schema 用于参数生成和验证。 | 进一步证明“函数签名即 agent contract”的趋势。 | [AutoGen tools](https://microsoft.github.io/autogen/stable//user-guide/core-user-guide/components/tools.html) |
| AutoGen MCP adapters | 可包装 MCP tools，通过 stdio/SSE/Streamable HTTP 接入。 | MCP 正在成为跨框架 tool interop 层。 | [AutoGen MCP workbench](https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/mcp-tools.html) |
| Pydantic AI ToolDefinition | ToolDefinition 包含 name、parameters JSON schema、strict 等。 | strict schema 可减少模型生成无效参数。 | [Pydantic AI Tools](https://ai.pydantic.dev/tools/) |
| Pydantic AI Toolsets | Toolset 可 list/validate/call tools，并可 prepare/omit tools in a step。 | 动态裁剪工具集合是框架级常见需求。 | [Pydantic AI Toolsets API](https://ai.pydantic.dev/api/toolsets/) |
| CrewAI tools | Tools 给 agent 可调用能力，并强调错误处理、安全和工具 repository。 | 对 MineMusic 的价值主要在“tool 生态需要治理”，不只是 handler 代码。 | [CrewAI Tools](https://docs.crewai.com/en/concepts/tools) |

**对 MineMusic 的参考价值**：这些框架进一步支持两个判断：第一，schema 与 description 是 agent-facing contract；第二，toolset/prepare/omit 这类动态暴露策略是必要工程能力。

**不宜直接照搬**：这些框架的具体 decorator、agent class、workbench 结构不是 MineMusic 的核心参考。MineMusic 更应吸收 contract、schema、toolset、validation、error handling 和 eval 思想。

---

## 3. 跨项目共同模式

### 3.1 Tool discovery 是显式流程，不是 prompt 里硬塞函数列表

MCP 有 `tools/list`；GitHub MCP 有 toolsets、tool allowlist、tool-search；Pydantic AI 有 toolset list/validate/call；OpenAI Apps SDK 和 ADK 都要求 agent runtime 有明确 tools 列表。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[GitHub MCP Server README](https://github.com/github/github-mcp-server)、[Pydantic AI Toolsets API](https://ai.pydantic.dev/api/toolsets/)、[Google ADK LLM agents](https://adk.dev/agents/llm-agents/)。

**为什么对 agent 有用**：agent 的工具选择空间越明确，越少出现“幻觉工具名”或调用不可用工具。工具列表还可以按权限、模式、账户状态、只读/写入策略动态裁剪。

**对 MineMusic 的参考维度**：Stage Interface Tool Frame 应有 tool registry / catalog / list API，并支持按 Stage、owner、account、runtime mode、side-effect policy 过滤，而不是把所有工具永久塞进 prompt。

---

### 3.2 Tool name / namespace / description 是控制平面

Anthropic 明确要求 description 写清做什么、何时用、何时不用、参数 caveats；LlamaIndex 说 tool name 和 description 会强烈影响模型选择工具与参数；LangChain 和 ADK 都从 docstring/签名生成工具 schema。来源：[Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)、[LlamaIndex Tools](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/tools/)、[LangChain Tools](https://docs.langchain.com/oss/python/langchain/tools)、[Google ADK Function tools](https://adk.dev/tools-custom/function-tools/)。

**为什么对 agent 有用**：模型不能看代码实现。它只能依赖 name、description、schema、examples 和上下文来选择工具。描述模糊会导致错误调用；参数名模糊会导致无效参数。

**对 MineMusic 的参考维度**：每个 Stage tool 的 description 应包含：做什么、适用场景、不适用场景、输入解释、输出语义、限制、常见后续动作。工具名应稳定、可命名空间化，避免 provider/internal 命名泄露。

---

### 3.3 输入必须 schema 化，并且运行时真实校验

MCP、OpenAI Apps SDK、OpenAI Agents SDK、ADK、Pydantic AI 都把 JSON Schema / type schema 作为工具定义核心部分。MCP 安全指南明确要求服务端验证输入；ADK 说明缺少必填参数时工具应向 LLM 返回错误以便修正。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference)、[OpenAI Agents SDK Tools](https://openai.github.io/openai-agents-python/tools/)、[Google ADK Function tools](https://adk.dev/tools-custom/function-tools/)、[Pydantic AI Tools](https://ai.pydantic.dev/tools/)。

**为什么对 agent 有用**：schema 不只防 crash，还告诉模型合法参数范围、必填字段、enum、默认值和嵌套结构。运行时校验错误如果可见，模型可以修正并重试。

**对 MineMusic 的参考维度**：Stage tool input schema 应包括 enum、min/max、默认值、互斥/依赖关系、limit 上限、cursor 格式、locale 等；handler 必须校验，不应只相信模型。

---

### 3.4 输出也应 schema 化，并返回稳定 public object

MCP 支持 `outputSchema` 和 `structuredContent`；OpenAI Apps SDK 示例使用 output schema；Anthropic 工程文章建议返回稳定 identifiers、避免低层技术 ID 和冗长 payload。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)。

**为什么对 agent 有用**：结构化输出能让模型可靠引用某个 item、决定下一步动作、向用户解释结果。低层 ID 或 provider raw JSON 会污染推理上下文，增加泄露和误操作风险。

**对 MineMusic 的参考维度**：音乐发现工具输出应是 public handle + compact public card + allowed actions + warning，而不是 raw `material_key`、`source_key`、`canonical_key`、provider payload 或数据库 row。

---

### 3.5 Read/write/destructive/open-world/idempotent 等 side-effect 要成为 contract

OpenAI Apps SDK 有 `readOnlyHint`、`destructiveHint`、`openWorldHint`、`idempotentHint`；GitHub MCP 有 read-only mode；Semantic Kernel 强调 side effects 描述；MCP 安全要求敏感操作确认。来源：[OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference)、[OpenAI Apps SDK: Build MCP server](https://developers.openai.com/apps-sdk/build/mcp-server)、[GitHub MCP Server README](https://github.com/github/github-mcp-server)、[Semantic Kernel Plugins](https://learn.microsoft.com/en-us/semantic-kernel/concepts/plugins/)、[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)。

**为什么对 agent 有用**：agent 是否能自动调用工具，取决于工具是否只读、是否写用户状态、是否影响外部世界、是否 destructive、是否可重试。side-effect 不写清，模型和 runtime 都无法可靠区分 search 与 save/delete/play/import。

**对 MineMusic 的参考维度**：Stage tool frame 至少应区分 `none`、`request_scoped`、`writes_user_state`、`external_action`、`admin_core` 或等价类别。第一个只读音乐发现工具应明确是 read/search，无 durable write。

---

### 3.6 权限影响工具可见性，而不只是调用失败

GitHub MCP 的 OAuth scope filtering 会隐藏无权限工具；MCP 要求访问控制；OpenAI Apps SDK 支持 `securitySchemes`。来源：[GitHub Changelog](https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/)、[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference)。

**为什么对 agent 有用**：如果模型看到一个无法调用的工具，它很可能选择它然后失败。权限过滤可以减少错误路径和上下文噪音。

**对 MineMusic 的参考维度**：Stage Interface list tools 时应考虑 owner/account/provider 状态。例如 provider 未授权时，不应暴露依赖该 provider 的写入/播放工具，或者应暴露为 `requires_account` 且只用于引导授权，不应让 agent 误以为能正常执行。

---

### 3.7 错误与超时是模型恢复能力的一部分

MCP 区分 protocol error 和 tool execution error；工具执行错误可返回 `isError: true`。OpenAI Agents SDK 支持 function tool timeout、timeout error function 和 model-visible error。Anthropic 工程文章建议返回 helpful errors。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[OpenAI Agents SDK Tools](https://openai.github.io/openai-agents-python/tools/)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)。

**为什么对 agent 有用**：agent 需要知道错误是参数问题、权限问题、超时、provider 不可用、无结果，还是系统内部失败。不同错误对应不同后续：重试、改参数、请求授权、换范围或向用户说明。

**对 MineMusic 的参考维度**：Stage tool result 应有 normalized error/warning model，例如 `invalid_input`、`auth_required`、`provider_unavailable`、`timeout_partial_result`、`not_found`、`internal_error`。只读发现工具应能返回 partial results + warnings，而不是只抛异常。

---

### 3.8 Tool catalog / handbook / examples 是运行时质量资产

MCP 有 tools/list；GitHub MCP 有 tool-search 和 toolsets；Anthropic 支持 input_examples；OpenAI Apps SDK 的 handoff checklist 包括 test prompts；Anthropic 工程文章强调为工具创建 evals。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[GitHub MCP Server README](https://github.com/github/github-mcp-server)、[Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)、[OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)。

**为什么对 agent 有用**：handbook/examples 不是装饰。它们能帮助模型理解边界、避免误用，也能成为 regression eval。工具改名、字段改动、side-effect 变更都需要更新 catalog 与 eval。

**对 MineMusic 的参考维度**：Stage Interface Tool Frame 应能从 tool definition 生成 handbook/工具卡；每个 tool 至少有 positive examples、negative examples、edge cases 和 golden prompts。

---

### 3.9 Tool 数量和输出长度受 context budget 约束

GitHub MCP 合并工具减少大量 context tokens；Anthropic 建议不要包装每个 endpoint，要设计少量高价值工具；GitHub README 建议只启用需要的 toolsets。来源：[GitHub Changelog](https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)、[GitHub MCP Server README](https://github.com/github/github-mcp-server)。

**为什么对 agent 有用**：工具描述会进入上下文；工具越多，模型越容易选错，token 也越贵。输出越长，后续推理越容易被低价值细节污染。

**对 MineMusic 的参考维度**：第一批 Stage tools 应少而语义完整。第一个只读音乐发现工具应返回 top-N compact items，不应返回 provider 原始搜索列表或完整 entity graph。

---

### 3.10 数据工具、渲染工具、动作工具要分开

OpenAI Apps SDK 建议把 data tool 与 render tool 分开，read/write 拆开；Semantic Kernel 区分 retrieval 与 task automation；MCP 安全模型对敏感操作强调确认。来源：[OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools)、[Semantic Kernel Plugins](https://learn.microsoft.com/en-us/semantic-kernel/concepts/plugins/)、[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)。

**为什么对 agent 有用**：查询、展示、写状态、外部动作的风险和自动化策略不同。混在一个工具中会使 agent 不知道调用后发生了什么。

**对 MineMusic 的参考维度**：`discover/search music`、`get item detail`、`save/favorite/block/feedback`、`resolve playback`、`admin merge/rebuild` 应属于不同工具类别和授权策略。第一个工具应保持只读。

---

## 4. 常见反模式

### 4.1 把每个内部 API endpoint 都包成 tool

Anthropic 明确反对把每个 API endpoint 包成工具，并建议设计少量高影响工具、合并多步流程。OpenAPI/函数自动生成虽然方便，但如果不重写 description、参数语义和输出，就会把内部 API 颗粒度暴露给 agent。来源：[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)、[Google ADK OpenAPI tools](https://adk.dev/tools-custom/openapi-tools/)。

**为什么有害**：agent 会面对过多低层工具，难以选择；还会被迫理解内部资源模型、provider 细节或数据库概念。

**MineMusic 风险**：把 `provider_raw_search`、`material_resolve_internal`、`canonical_promote`、`owner_catalog_rebuild` 等内部 API 暴露给普通 Stage agent，会破坏 Stage Interface 边界。

---

### 4.2 工具描述只有 “Search music” 这类空泛文本

Anthropic 和 LlamaIndex 都说明 name/description 直接影响工具选择；OpenAI Apps SDK 也强调 discovery 主要由 metadata 驱动。来源：[Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)、[LlamaIndex Tools](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/tools/)、[OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools)。

**为什么有害**：模型不知道何时用、何时不用、参数怎么填、结果是否可作为最终答案。

**MineMusic 风险**：音乐场景有搜索、推荐、识别、播放、收藏、纠错、导入等多类动作。如果描述不写边界，agent 会用发现工具回答音乐理论问题，或用搜索结果当作已保存状态。

---

### 4.3 读工具暗中写 durable 状态

OpenAI Apps SDK 建议 read/write 拆分；GitHub MCP 提供 read-only mode；MCP 对敏感操作要求确认。来源：[OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools)、[GitHub MCP Server README](https://github.com/github/github-mcp-server)、[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)。

**为什么有害**：agent 以为是安全查询，实际却写用户状态、导入 provider 数据或 materialize 候选，导致不可预期 side effect。

**MineMusic 风险**：普通 provider search hit 不应默认创建 durable `Material`。只读音乐发现工具应保持 `none` 或 `request_scoped` side effect；save/favorite/block/feedback 才是 commitment boundary。

---

### 4.4 返回 raw provider JSON / raw DB row / 内部 ID

Anthropic 建议返回高信号信息和稳定 identifiers，避免低层技术 ID；MCP output schema 也鼓励结构化结果。来源：[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)、[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)。

**为什么有害**：低层 payload 消耗 context，增加 prompt injection/隐私泄露风险，并把 agent 推向内部实现语义。

**MineMusic 风险**：Stage output 若暴露 `source_key`、`canonical_key`、provider raw ID、版权字段、DB provenance JSON，agent 会开始依赖内部结构，后续 schema/identity 重构会变得困难。

---

### 4.5 只用 annotations 表示安全，不做 server-side enforcement

OpenAI Apps SDK reference 明确提醒：annotations 帮助模型和 UI，但 server 仍必须执行自己的 auth。MCP 也要求服务端访问控制和输入验证。来源：[OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference)、[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)。

**为什么有害**：LLM 和 client 可能忽略 annotation；攻击者也可绕过提示层直接调用工具。

**MineMusic 风险**：`readOnlyHint`、`requiresApproval`、`sideEffect` 只能是控制信号，不能替代 server-side permission、ownerScope 校验和 account 授权。

---

### 4.6 无 output schema，只返回自由文本

MCP 和 OpenAI Apps SDK 都支持 output schema；Anthropic 建议稳定、高信号输出。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)。

**为什么有害**：agent 需要从自然语言中猜 item handle、可用 actions、是否还有下一页、哪些是警告，容易出错。

**MineMusic 风险**：音乐发现结果需要后续 action，例如“播放第二首”“保存这张专辑”“不要再推荐这个版本”。没有结构化 output，agent 难以安全引用具体 item。

---

### 4.7 默认暴露所有工具

GitHub MCP 提供 toolsets、tool allowlist、read-only mode 和 OAuth scope filtering。来源：[GitHub MCP Server README](https://github.com/github/github-mcp-server)、[GitHub Changelog](https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/)。

**为什么有害**：工具越多，模型越容易错选；无权限工具会造成失败路径；高风险工具可能被自动调用。

**MineMusic 风险**：Stage Interface 应按 mode 暴露工具。例如只读发现 stage 不应暴露 save、feedback、playback、provider sync、admin repair。

---

### 4.8 把 tool handler 写成 provider SDK 的薄包装

LlamaIndex/Anthropic/OpenAI 都把 tool 设计为给 agent 的 API，而不是内部函数。来源：[LlamaIndex Tools](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/tools/)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)、[OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools)。

**为什么有害**：provider SDK 的参数和错误语义通常不是 agent-friendly；还会泄露 provider 内部字段，并绕过 domain/application service。

**MineMusic 风险**：`Stage tool -> NetEase SDK -> raw provider result` 会把 provider 细节直接带到 agent-facing 层，破坏可插拔 provider 和 durable identity 边界。

---

## 5. 对 MineMusic Stage Interface Tool Frame 有参考价值的设计维度

以下是设计维度，不是最终 spec。

### 5.1 Tool identity

可参考字段：

- `name`：稳定、机器可读、snake_case 或兼容多 provider 的命名风格。
- `title`：人类可读标题。
- `namespace` / prefix：减少多 server、多 provider、多 stage 时的混淆。
- `version` 或 contract version：便于 deprecation 与 handbook 生成。

外部依据：MCP tool definition 有 name/title/description；LangChain 建议 tool 名称用兼容性好的 snake_case；Anthropic 建议 namespacing 减少混淆。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[LangChain Tools](https://docs.langchain.com/oss/python/langchain/tools)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)。

对 agent 的作用：稳定名称减少 hallucinated tool；namespace 让 agent 在多个音乐/provider/Stage 工具之间区分能力来源。

---

### 5.2 Discovery / catalog

可参考字段或能力：

- `listTools(ctx)`：按 owner、account、Stage、side-effect policy、permission 过滤。
- `toolsets`：read-only、discovery、recommendation、user-state-action、playback、admin/internal。
- `listChanged` 或等价版本信号：工具集合变化时刷新 catalog。
- `toolSearch` / handbook search：按 name、description、parameter 查找工具。

外部依据：MCP `tools/list`；GitHub MCP toolsets、tool-search、read-only mode、OAuth scope filtering。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[GitHub MCP Server README](https://github.com/github/github-mcp-server)、[GitHub Changelog](https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/)。

对 agent 的作用：agent 看到的是当前可用、当前有权限、当前任务相关的工具，而不是全局工具堆。

---

### 5.3 Description / usage guidance

建议每个 tool 的描述回答：

- 做什么。
- 什么时候用。
- 什么时候不用。
- 输入参数语义。
- 输出结果代表什么、不代表什么。
- 限制、caveats、常见失败原因。
- 常见 follow-up actions。

外部依据：Anthropic description 指南；OpenAI Apps SDK 的 metadata-driven discovery；LlamaIndex 对 name/description 影响 tool choice 的说明。来源：[Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)、[OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools)、[LlamaIndex Tools](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/tools/)。

对 agent 的作用：减少错误工具选择，减少参数误填，避免用音乐发现工具回答非候选类问题。

---

### 5.4 Input schema

可参考字段：

- JSON Schema / Zod schema / TypeScript type 的单一来源。
- 必填字段、enum、长度限制、limit 上限、cursor 格式。
- 参数描述和 examples。
- strict / validation mode。
- input validation error 的 normalized result。

外部依据：MCP inputSchema；OpenAI Agents SDK 从 Pydantic/类型生成 schema；ADK 函数工具的参数校验；Pydantic AI strict schema。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[OpenAI Agents SDK Tools](https://openai.github.io/openai-agents-python/tools/)、[Google ADK Function tools](https://adk.dev/tools-custom/function-tools/)、[Pydantic AI Tools](https://ai.pydantic.dev/tools/)。

对 agent 的作用：模型可以生成更合法的参数；无效参数能被纠正，而不是变成不可解释失败。

---

### 5.5 Output schema / public result contract

可参考字段：

- `structuredContent` / structured output。
- `outputSchema`。
- `items` + `nextCursor` + `warnings`。
- public handle，而非 raw DB/provider ID。
- `allowedActions`：后续可执行动作。
- `resultSemantics`：结果是候选、catalog item、已保存 item、可播放 item，还是临时 provider candidate。

外部依据：MCP outputSchema 和 structuredContent；OpenAI Apps SDK outputSchema；Anthropic 高信号输出和稳定 ID 建议。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)。

对 agent 的作用：agent 可以可靠引用“第 2 首/这个 handle”，知道下一步能否 save/play/recommend_more，不需要解析自然语言。

---

### 5.6 Side-effect / write policy

可参考字段：

- `sideEffect`: `none` / `request_scoped` / `writes_user_state` / `external_action` / `admin_core`。
- `readOnlyHint` / `destructiveHint` / `openWorldHint` / `idempotentHint` 等等价信息。
- `requiresApproval`。
- `durability`: no write / temp candidate / user-state write / external action / internal maintenance。

外部依据：OpenAI Apps SDK annotations；GitHub MCP read-only mode；Semantic Kernel side effects；MCP human confirmation guidance。来源：[OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference)、[GitHub MCP Server README](https://github.com/github/github-mcp-server)、[Semantic Kernel Plugins](https://learn.microsoft.com/en-us/semantic-kernel/concepts/plugins/)、[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)。

对 agent 的作用：agent runtime 可以自动调用只读工具，但对写状态/外部动作做确认或禁用。

---

### 5.7 Permission / account / context

可参考字段：

- `requiredScopes` / `securitySchemes`。
- `requiresAccount`: provider account 是否已连接。
- `accountState`: available / requires_account / unavailable。
- `ownerScope`、`sessionId`、`locale`、`requestId` 来自 runtime context，不由模型自由传入。
- discovery-time filtering：无权限工具不暴露或标记为不可用。

外部依据：OpenAI Apps SDK securitySchemes；GitHub OAuth scope filtering；MCP access controls。来源：[OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference)、[GitHub Changelog](https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/)、[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)。

对 agent 的作用：减少无权限调用；避免让模型伪造 owner/session/account；让工具选择符合当前用户状态。

---

### 5.8 Runtime policy

可参考字段：

- `timeoutMs`。
- retry policy。
- rate limit。
- concurrency limit。
- partial result policy。
- cancellation。
- resource lifecycle / cleanup。

外部依据：MCP 客户端应设置超时并记录使用；OpenAI Agents SDK function tools 支持 timeout；ADK Toolsets 支持 close/cleanup。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[OpenAI Agents SDK Tools](https://openai.github.io/openai-agents-python/tools/)、[Google ADK Custom tools](https://adk.dev/tools-custom/)。

对 agent 的作用：避免工具长时间挂起；provider 慢或部分失败时，agent 可得到 partial output 和 warning。

---

### 5.9 Error / warning model

可参考字段：

- `isError` / normalized error result。
- `error.code`、`messageForModel`、`messageForUser`。
- `retryable`。
- `suggestedFix`。
- `warnings`：provider unavailable、auth required、partial timeout、result truncated。

外部依据：MCP `isError`；OpenAI Agents SDK failure error function；Anthropic helpful errors。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[OpenAI Agents SDK Tools](https://openai.github.io/openai-agents-python/tools/)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)。

对 agent 的作用：agent 可以从错误中恢复，向用户解释，或改参数重试。

---

### 5.10 Handler boundary

可参考约束：

- Tool handler 只调用窄 application service / query service。
- 不直接依赖 provider SDK。
- 不直接依赖 database / repository / raw capability registry。
- 不返回 internal domain DTO。
- handler 做 input validation、context binding、timeout/error normalization、audit。

外部依据：OpenAI/Anthropic/LlamaIndex 对 tool 是 agent-facing API 的定位；MCP security requirement；Semantic Kernel 对 plugin semantic functions 的定位。来源：[OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)、[LlamaIndex Tools](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/tools/)、[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[Semantic Kernel Plugins](https://learn.microsoft.com/en-us/semantic-kernel/concepts/plugins/)。

对 agent 的作用：tool contract 稳定，即使 provider / DB / material identity 内部重构，agent-facing 行为不随之破裂。

---

### 5.11 Examples / handbook / evals

可参考字段：

- `inputExamples`。
- positive examples。
- negative examples / do-not-use examples。
- golden prompts。
- expected tool call shape。
- expected error recovery。
- handbook generated from tool definitions。

外部依据：Anthropic input_examples；OpenAI Apps SDK handoff checklist 和 test prompts；Anthropic 工程文章建议为工具创建 evals。来源：[Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)、[OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)。

对 agent 的作用：examples 能显著降低复杂参数误填；evals 防止工具描述改动导致模型调用退化。

---

### 5.12 Versioning / deprecation

可参考字段：

- contract version。
- deprecation status。
- alias / backward-compatible tool names。
- `listChanged` / catalog version。
- toolset compatibility。

外部依据：MCP `listChanged`；GitHub MCP 支持工具 exact names 和 aliases；MCP registry 提供 server catalog 思路。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[GitHub MCP Server README](https://github.com/github/github-mcp-server)、[MCP Registry](https://github.com/modelcontextprotocol/registry)。

对 agent 的作用：工具改名或字段迁移时，agent/client 不会突然失效。

---

## 6. 对第一个只读音乐发现工具的设计建议（非 spec）

本节只给建议，不定义最终接口。

### 6.1 工具定位

第一个工具建议定位为：**只读音乐发现 / 搜索工具**。它的职责是根据自然语言 query，在用户可见 catalog 和可用 provider candidate 中找出具体音乐候选，并返回 compact public results。

它不应承担：

- 保存 / 收藏 / 加入 collection。
- block / wrong version / bad match / liked/disliked feedback。
- 播放或打开外部链接。
- canonical promotion / material merge / catalog rebuild。
- provider library import。
- 默认 durable materialization 普通 provider search hit。

外部依据：OpenAI Apps SDK 建议 read/write 拆分；GitHub MCP 有 read-only mode；Anthropic 建议工具少而明确、不要包每个 endpoint。来源：[OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools)、[GitHub MCP Server README](https://github.com/github/github-mcp-server)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)。

**为什么对 agent 有用**：agent 可以安全地自动调用发现工具，不需要用户确认；工具返回的候选可以作为下一轮“保存/播放/反馈”的输入。

---

### 6.2 命名建议

候选名：

- `minemusic_search_music`
- `minemusic_discover_music`
- `minemusic_find_music_items`

建议倾向：`minemusic_search_music` 或 `minemusic_discover_music`。`search` 更符合用户意图和工具习惯；`discover` 更适合包含 local catalog + provider candidates + recommendation seed 的语义。最终命名应由 MineMusic 的 Stage vocabulary 决定。

命名原则：

- 使用稳定 prefix，避免与其他 server/tool 混淆。
- 不使用 provider 名，例如 `netease_search`。
- 不使用内部词，例如 `material_query`、`source_entity_search`。
- 不把 `recommend` 混入第一个只读发现工具名，除非它真的执行推荐策略而不是搜索候选。

外部依据：LangChain 的命名兼容性建议；Anthropic 的 namespacing 建议；GitHub MCP 的 server/tool 区分能力。来源：[LangChain Tools](https://docs.langchain.com/oss/python/langchain/tools)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)、[GitHub MCP Server README](https://github.com/github/github-mcp-server)。

---

### 6.3 Description 建议

可参考描述结构：

> Search the user's MineMusic-visible catalog and optionally available provider candidates for concrete music items such as recordings, albums, or artists matching a natural-language query. Use this when the user asks to find, identify, compare, or choose specific music items. Do not use this for general music theory, broad artist biography, or requests that do not need candidate music results. The result returns compact public handles and display fields; it does not save, play, modify user state, or expose provider raw IDs/internal material records.

中文等价：

> 搜索用户在 MineMusic 中可见的音乐 catalog，并可按策略包含可用 provider 的临时候选，返回与自然语言查询匹配的具体曲目、专辑或艺术家。适用于用户要求查找、识别、比较或选择具体音乐对象的场景。不适用于音乐理论、泛泛艺人传记、或不需要候选音乐结果的问题。结果只返回 compact public handle 和展示字段；不会保存、播放、修改用户状态，也不会暴露 provider raw ID 或内部 material/source/canonical 记录。

外部依据：Anthropic 对 description 的要求；OpenAI Apps SDK 对 metadata/use-this-when 的要求。来源：[Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)、[OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools)。

---

### 6.4 输入建议

非最终接口，仅示意：

```ts
// Shape sketch only. Not a MineMusic spec.
type ReadOnlyMusicDiscoveryInput = {
  query: string;
  targetKind?: "recording" | "album" | "artist";
  sourcePolicy?:
    | "visible_catalog_only"
    | "catalog_first_include_provider_candidates";
  limit?: number;        // bounded, e.g. 1..20
  cursor?: string;       // opaque public cursor
};
```

字段解释：

- `query`：自然语言音乐查询。应有最小长度、最大长度、trim 规则。
- `targetKind`：限制结果类型；不要让模型自由填 `track/song/release/material/source` 等混杂词。
- `sourcePolicy`：明确是否只查用户可见 catalog，还是允许 provider 临时候选。默认值应偏安全、可解释。
- `limit`：必须有上限，避免输出过长。
- `cursor`：不暴露内部 offset / DB key / provider raw token。

外部依据：MCP/OpenAI/ADK/Pydantic AI 对 input schema 和校验的强调；Anthropic 对参数说明和 examples 的要求。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[OpenAI Agents SDK Tools](https://openai.github.io/openai-agents-python/tools/)、[Google ADK Function tools](https://adk.dev/tools-custom/function-tools/)、[Pydantic AI Tools](https://ai.pydantic.dev/tools/)、[Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)。

---

### 6.5 输出建议

非最终接口，仅示意：

```ts
// Shape sketch only. Not a MineMusic spec.
type ReadOnlyMusicDiscoveryOutput = {
  items: ReadOnlyMusicDiscoveryItem[];
  nextCursor?: string;
  warnings?: ToolWarning[];
  resultSemantics: "candidate_results_not_saved";
};

type ReadOnlyMusicDiscoveryItem = {
  handle: string;  // stable public handle, not raw DB/provider ID
  kind: "recording" | "album" | "artist";
  title: string;
  artistNames?: string[];
  albumTitle?: string;
  year?: number;
  availability: "playable" | "restricted" | "unavailable" | "unknown";
  sourceSummary: "visible_catalog" | "provider_candidate" | "mixed";
  matchReason?: string;
  allowedActions: Array<
    | "get_details"
    | "search_more_like_this"
    | "save"
    | "play"
    | "mark_wrong_version"
  >;
};

type ToolWarning = {
  code:
    | "provider_unavailable"
    | "auth_required"
    | "partial_timeout"
    | "results_truncated"
    | "no_exact_match";
  message: string;
};
```

输出原则：

- 返回 `handle`，不返回 `material_key` / `source_key` / `canonical_key`。
- 返回 compact fields，避免 raw provider JSON。
- `resultSemantics` 明确结果是候选，不代表已保存或已播放。
- `allowedActions` 告诉 agent 哪些后续工具适用。
- `warnings` 比抛异常更适合部分失败场景。
- `nextCursor` 应 opaque，不泄露排序键或 provider cursor。

外部依据：MCP structuredContent/outputSchema；Anthropic 高信号输出与稳定 ID 建议；GitHub MCP 对 context budget 的优化经验。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)、[GitHub Changelog](https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/)。

---

### 6.6 Side effect 建议

第一个只读工具建议：

- `sideEffect`: `none` 或 `request_scoped`。
- `readOnlyHint`: true 等价信息。
- `destructiveHint`: false。
- `openWorldHint`: 取决于是否访问外部 provider。若只查本地 catalog，可以是 false；若查 provider candidates，则应标记可能访问外部服务。
- `requiresApproval`: false。
- `durability`: 不写 durable user state，不默认 materialize provider candidates。

外部依据：OpenAI Apps SDK side-effect annotations；GitHub MCP read-only mode；MCP security guidance。来源：[OpenAI Apps SDK reference](https://developers.openai.com/apps-sdk/reference)、[GitHub MCP Server README](https://github.com/github/github-mcp-server)、[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)。

**关键解释**：只读发现工具可以产生 request-scoped candidate relation / temporary search state，但不应把 provider search hit 默认写成 durable music identity。这样 agent 可以安全探索候选，后续 save/feedback/play 才进入明确 action 工具。

---

### 6.7 错误和 warning 建议

建议错误类别：

| Code | 语义 | Agent 可采取的动作 |
|---|---|---|
| `invalid_input` | 参数无效、query 太短、limit 超界、targetKind 不合法 | 修正参数后重试 |
| `auth_required` | 需要连接 provider 账户或授权 scope | 向用户说明需要授权，或改用 catalog-only |
| `provider_unavailable` | 外部 provider 暂不可用 | 返回本地结果或稍后重试 |
| `partial_timeout` | 部分来源超时 | 使用 partial results，提示用户结果不完整 |
| `no_results` | 没有候选 | 改 query、放宽 targetKind、请求用户补充信息 |
| `internal_error` | 服务器内部错误 | 向用户说明失败，不重复盲目调用 |

外部依据：MCP `isError`；OpenAI Agents SDK error_as_result / timeout；Anthropic helpful errors。来源：[MCP Tools spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)、[OpenAI Agents SDK Tools](https://openai.github.io/openai-agents-python/tools/)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)。

---

### 6.8 Handbook / examples 建议

建议为第一个工具准备以下 examples：

Positive examples:

```json
{
  "query": "周杰伦 夜曲",
  "targetKind": "recording",
  "sourcePolicy": "catalog_first_include_provider_candidates",
  "limit": 5
}
```

```json
{
  "query": "albums by Radiohead around 1997",
  "targetKind": "album",
  "sourcePolicy": "visible_catalog_only",
  "limit": 10
}
```

Negative / do-not-use examples:

- 用户问“解释爵士和蓝调的区别”时，不需要音乐候选结果，不应调用此工具。
- 用户说“把第二首存到我的收藏”时，应调用 save/action 工具，而不是再次搜索。
- 用户说“播放这首”时，应调用 playback 工具，而不是 discovery 工具。
- 用户要求“修复错误版本匹配”时，应调用 feedback/correction 工具，不是 discovery 工具。

外部依据：Anthropic input_examples；OpenAI Apps SDK test prompts；Anthropic 工具 eval 建议。来源：[Anthropic: Define tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)、[OpenAI Apps SDK: Plan tools](https://developers.openai.com/apps-sdk/plan/tools)、[Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)。

---

## 7. 通用模式、框架特有设计、不适合 MineMusic 直接采用的做法

### 7.1 通用模式

| 模式 | 说明 | 代表来源 |
|---|---|---|
| Explicit tool discovery | 工具列表由 runtime/server 显式提供，可分页、过滤、变化通知。 | [MCP](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [GitHub MCP](https://github.com/github/github-mcp-server) |
| Metadata controls selection | name/description/use-when/parameter docs 决定模型是否调用。 | [Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools), [LlamaIndex](https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/tools/) |
| JSON Schema contracts | 输入输出 schema 是 tool contract 核心。 | [MCP](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [OpenAI](https://developers.openai.com/apps-sdk/reference), [Pydantic AI](https://ai.pydantic.dev/tools/) |
| Side-effect annotations | read-only/write/destructive/open-world/idempotent 影响自动调用和确认。 | [OpenAI Apps SDK](https://developers.openai.com/apps-sdk/reference), [GitHub MCP](https://github.com/github/github-mcp-server) |
| Permission-gated visibility | 无权限工具应被隐藏或标记不可用。 | [GitHub Changelog](https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/), [MCP](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) |
| Structured output | tool result 应可由模型和 UI 稳定消费。 | [MCP](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [OpenAI Apps SDK](https://developers.openai.com/apps-sdk/reference) |
| Helpful errors | 业务错误应模型可见、可恢复。 | [MCP](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/tools/) |
| Toolset/context budget | 少量高价值工具优于大量 endpoint wrappers。 | [Anthropic](https://www.anthropic.com/engineering/writing-tools-for-agents), [GitHub Changelog](https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/) |
| Examples/evals | examples 和 golden prompts 是工具质量资产。 | [Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools), [OpenAI Apps SDK](https://developers.openai.com/apps-sdk/plan/tools) |

---

### 7.2 框架特有设计

| 框架/项目 | 特有设计 | 是否值得 MineMusic 直接采用 |
|---|---|---|
| MCP | `tools/list` / `tools/call` protocol、`structuredContent`、`isError`。 | 高参考价值；可作为 Stage tool list/call/error 的外部基准，但不决定 MineMusic domain boundary。 |
| OpenAI Apps SDK | `_meta`、UI component、securitySchemes、readOnly/destructive/openWorld/idempotent hints。 | side-effect/auth hints 值得借鉴；UI component 机制不应直接绑定 MineMusic core。 |
| Anthropic | input_examples、tool_choice、strict tool use、工具写作/eval 指南。 | description/examples/evals 非常值得借鉴；API-level tool_choice 可转译为 Stage Runtime policy。 |
| GitHub MCP | toolsets、read-only mode、OAuth scope filtering、tool-search、aliases。 | 对 MineMusic 的 tool exposure/capability gating 很有价值；分组方式应按音乐任务而非 provider API。 |
| LangChain / ADK / OpenAI Agents | 函数/docstring/type hints 自动生成 tool schema。 | 可用于开发效率；不能让内部函数直接变 agent-facing contract。 |
| Semantic Kernel | plugin 函数组、retrieval vs automation、side effects。 | 可借鉴 tool grouping 和 role-based tool exposure。 |
| Pydantic AI | strict schema、toolset prepare/omit。 | 可借鉴 strict validation 和动态 omit 工具。 |
| OpenAPI tool generators | 从 OpenAPI spec 生成 tools。 | 只适合 bootstrap，不适合 MineMusic 直接暴露内部 API。 |

---

### 7.3 不适合 MineMusic 直接采用的做法

1. **直接用 provider API endpoint 生成 Stage tools**。原因：provider API 颗粒度和错误语义不是 agent-friendly，会泄露 provider 细节。
2. **把 tool decorator 当作最终合约**。原因：内部函数名/docstring 往往不足以表达何时用、何时不用、side effect 和输出语义。
3. **默认暴露全部 tools**。原因：上下文膨胀、工具误选、权限失败和高风险调用概率增加。
4. **把只读发现和保存/播放/反馈合在一个工具**。原因：side effect 不透明，无法自动调用策略和权限控制。
5. **让 annotations 替代 enforcement**。原因：tool annotations 只是提示，server 仍必须做 auth/access/input validation。
6. **返回完整 provider payload / DB graph**。原因：污染 agent context，破坏 Stage Interface 稳定性和隐私边界。
7. **把 Stage tool handler 写成跨层大函数**。原因：handler 会同时承担 provider 访问、query、materialization、presentation 和 error mapping，最终失去可测试边界。

---

## 8. 可执行检查清单

### 8.1 Tool definition checklist

- [ ] 工具有稳定 `name`，不包含 provider/internal 实现名。
- [ ] `description` 包含 use-when / do-not-use-when / output semantics / limitations。
- [ ] 输入有 JSON Schema，包含 enum、limit、默认值、参数描述。
- [ ] 输出有 JSON Schema 或等价结构化 contract。
- [ ] side effect 明确：read-only、request-scoped、writes user state、external action、admin/internal。
- [ ] 权限和 account requirements 明确。
- [ ] timeout / retry / rate limit / partial result policy 明确。
- [ ] 错误可被 agent 理解和恢复。
- [ ] 输出不含 raw DB/provider/canonical/source internal fields。
- [ ] 有 positive examples、negative examples、golden prompts。
- [ ] handler 只依赖窄 application service / query service。
- [ ] tool catalog / handbook 可自动生成或至少与 definition 同源。

### 8.2 First read-only discovery tool checklist

- [ ] 不写用户状态。
- [ ] 不播放、不保存、不反馈、不导入 provider library。
- [ ] 不默认 durable materialize provider search hit。
- [ ] 支持 limit 上限和输出截断 warning。
- [ ] 返回 public handle 和 compact item。
- [ ] 返回 allowedActions。
- [ ] provider 失败可返回 partial results + warning。
- [ ] description 明确它不是 general music knowledge tool。
- [ ] examples 覆盖 recording / album / artist。
- [ ] negative examples 覆盖 save/play/feedback/general explanation。

---

## 9. 附录：主要来源链接

- MCP Tools specification 2025-06-18: <https://modelcontextprotocol.io/specification/2025-06-18/server/tools>
- MCP Registry: <https://github.com/modelcontextprotocol/registry>
- OpenAI Apps SDK — Plan tools: <https://developers.openai.com/apps-sdk/plan/tools>
- OpenAI Apps SDK — Build MCP server: <https://developers.openai.com/apps-sdk/build/mcp-server>
- OpenAI Apps SDK — Reference: <https://developers.openai.com/apps-sdk/reference>
- OpenAI Agents SDK — Tools: <https://openai.github.io/openai-agents-python/tools/>
- Anthropic Claude tool use overview: <https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview>
- Anthropic — Define tools: <https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools>
- Anthropic Engineering — Writing tools for agents: <https://www.anthropic.com/engineering/writing-tools-for-agents>
- GitHub MCP Server: <https://github.com/github/github-mcp-server>
- GitHub Changelog — MCP Server Projects tools and OAuth scope filtering: <https://github.blog/changelog/2026-01-28-github-mcp-server-new-projects-tools-oauth-scope-filtering-and-new-features/>
- LangChain Tools: <https://docs.langchain.com/oss/python/langchain/tools>
- LlamaIndex Tools: <https://developers.llamaindex.ai/python/framework/module_guides/deploying/agents/tools/>
- Semantic Kernel Plugins: <https://learn.microsoft.com/en-us/semantic-kernel/concepts/plugins/>
- Semantic Kernel Agent functions: <https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/agent-functions>
- Google ADK Custom tools: <https://adk.dev/tools-custom/>
- Google ADK Function tools: <https://adk.dev/tools-custom/function-tools/>
- Google ADK OpenAPI tools: <https://adk.dev/tools-custom/openapi-tools/>
- Google ADK LLM agents: <https://adk.dev/agents/llm-agents/>
- Google ADK State: <https://adk.dev/sessions/state/>
- AutoGen tools: <https://microsoft.github.io/autogen/stable//user-guide/core-user-guide/components/tools.html>
- AutoGen MCP tools: <https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/mcp-tools.html>
- Pydantic AI Tools: <https://ai.pydantic.dev/tools/>
- Pydantic AI Toolsets API: <https://ai.pydantic.dev/api/toolsets/>
- CrewAI Tools: <https://docs.crewai.com/en/concepts/tools>

---

## 10. 最终归纳

外部成熟生态给出的共同答案是：agent-facing tool 的设计中心不是 handler，而是 **可被模型正确选择、可被 runtime 安全调用、可被系统测试和治理的 contract**。

对 MineMusic Stage Interface Tool Frame，最有参考价值的维度是：

1. 显式 tool discovery / catalog。
2. 高质量 name/description/use guidance。
3. 输入输出 schema。
4. side-effect / permission / account state。
5. timeout / error / warning / partial result。
6. public handle 和 compact output。
7. toolsets / read-only mode / capability gating。
8. examples / handbook / evals。
9. handler 与 domain/provider/storage 的边界。
10. versioning / deprecation / audit。

第一个只读音乐发现工具应作为 search/retrieval 类工具起步：只返回候选，不写 durable state，不暴露内部 ID，不承担保存/播放/反馈，不直接包 provider SDK。它的价值在于给 agent 一个安全、稳定、可自动调用的音乐候选发现能力，并为后续明确的 action tools 提供 public handles。
