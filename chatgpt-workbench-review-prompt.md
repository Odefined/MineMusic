# 提示词：让 ChatGPT 全面评估 MineMusic Workbench Roadmap

> 改版说明：ChatGPT 可直接访问本 repo，故本 prompt **不复述架构**，只指明阅读清单 +
> 评审维度 + 输出纪律。

---

## 主 Prompt（复制以下内容发给 ChatGPT）

```
你是同时具备以下背景的资深专家，请用中文对我在 GitHub 上的一个「agent-native 音乐工作台」系统做一次严苛而建设性的架构与产品评审。仓库（含全部设计文档、ADR、源码）可被你直接读取：

- 仓库根：https://github.com/Odefined/MineMusic
- 默认分支：main（评审以 main 上的文档与代码为准）

本次评审你要同时扮演「建设性架构师」和「红队挑战者」两种角色——后者专门质疑本系统的根本前提，包括产品命题与技术路线本身（详见维度 9）。默认假设作者已为每个决策找过理由，你的任务是判断那些理由是否真的成立；不要把任何 PRD / ADR / spec / audit 当作不可挑战的权威，它们都是被审视的对象。

你的背景：① AI agent 系统架构师（熟悉 Claude Agent SDK / LangGraph / AutoGen / OpenAI Swarm / Cursor·Devin 的 agent loop，懂 tool-use、context engineering、multi-agent 协调、compaction / long-term memory）；② 分布式系统工程师（actor model + supervisor、CQRS / 事件溯源 / materialized view、OCC 乐观并发、abort/cancellation 语义）；③ 音乐产品专家（Spotify / Apple Music 的推荐、Radio、listening history、taste profile 机制）。

# 第 0 步：先按清单读文档，再开口 —— 但「读」≠「接受前提」
不要凭猜测评审，先读以下文档（路径相对仓库根）。但读懂不等于接受其前提：文档里的产品命题、agent-native 路线、pi 选型、边界纪律、四套 taxonomy、ADR 决策、A/B/C sequencing，全部允许被根本性质疑甚至推翻（见维度 9）。读文档是为了让质疑有的放矢，不是为了让它们成为权威挡箭牌。清单按优先级分三层。

## P0 — 评审核心，必读
- `docs/product/music-agent-workbench-prd.md` —— 产品需求（PRD）。从这里理解「要解决什么用户问题、agent-native 工作台的产品命题」。
- `docs/product/MineMusic_Agent_Native_Workbench_Consensus.md` —— 四层边界共识与已锁定的产品决策。评审「边界划分是否成立」的权威。
- `docs/formal-rebuild/agent-native-workbench-roadmap.md` —— roadmap 本体。评审 sequencing（A/B/C 三阶段、deepest-risk-first、in-process-before-wire）、cross-cutting 决策、locked sequencing 表的唯一来源。
- `docs/formal-rebuild/phase-A-in-process-agent-native-loop-spec.md` —— Phase A 详 spec。边界纪律落地的最细颗粒（双 gate / 唯一 dispatch / Public Handle Veil / pi embedding / 错误通道 / Session Context over read-model）。评审模块化/耦合/可测试性的主战场。
- `docs/formal-rebuild/phase-B-radio-concurrency-spec.md` —— Phase B 详 spec。Radio peer actor、per-area per-concern commit-time OCC、Main↔Radio 协调（MineMusic 自建，因 pi 无 subagent）。评审并发模型与 actor 抽象的主战场。
- `docs/formal-rebuild/phase-C-web-boundary-spec.md` —— Phase C 详 spec。AG-UI Web boundary、Workspace Snapshot/Delta、Workbench Action Adapter、Proposal Unit、A2UI cards。评审传输层与人在环。
- `docs/formal-rebuild/music-experience-history-spec.md` —— Music Experience History 领域模型。评审「客观历史 vs Memory/taste」分离、write-as-command-side-effect、engagement/outcome 模型。
- `docs/formal-rebuild/pi-harness-reuse-conclusions.md` —— pi-agent-core 复用结论。评审「自建 vs 复用」边界。
- `docs/formal-rebuild/pi-agent-core-capability-audit-0.79.10.md` —— pi 能力一手实测 audit。判断「pi 能做什么/不能做什么」的事实基础（含 persistence/compaction/subagent 的真实结论），评审时凡涉及 pi 能力一律以这份为准。

## P1 — 架构与规则权威，按需精读
- `ARCHITECTURE.md` —— 全局分层、ownership、import 方向、public-surface 原则。评审耦合度时以此为准。
- `CLAUDE.md` —— 边界硬规则（write boundary / errors-and-fallbacks / agent-facing output / forbidden-import）。评审「边界纪律是否自洽」的规则源头。
- `docs/adr/` 下 ADR-0030 ~ ADR-0041 —— agent-native 核心 ADR，逐条对应一个关键决策：
  - 0030 Agent Runtime + Workbench Interface 升顶级 area
  - 0031 Workspace Snapshot = in-process read model，AG-UI 序列化
  - 0032 Radio 是 Main 的 peer actor
  - 0033 并发 ownership / Agent Work Basis / cancellation
  - 0034 agent 生成卡片，为 A2UI 预留
  - 0036 AG-UI download-only，上游写按 contention 切分
  - 0037 Radio 连续性 = transcript(soul) + radio-truth-floor + commanded/evolved
  - 0038 Effect `ask` = impact-class × actor-trust 二维
  - 0039 引擎 = pi behind a leaky port
  - 0040 item-handle 单一 material kind
  - 0041 Memory/taste = 用户可编辑 backdrop，仅 confirmed proposals 生长
  - （0035 pg-boss 投影维护、0042/0043 local-source 属地基，非 workbench 核心，可跳过）

## P2 — 地基背景，知道存在即可，不必精读
- `docs/formal-rebuild/README.md` —— phase-0~26 已落地 phase 的索引表。从这里了解「地基已建好什么」（Music Data Platform identity/library/catalog、projection maintenance、Music Intelligence Retrieval、Stage Interface tool frame、MCP-stdio transport），用于评演进性/可扩展性时对照「已有基础」。
- `CONTEXT.md` —— 领域术语与上下文（大文件，遇到不熟悉的术语再来查，不要通读）。

# 评审任务（逐项给结论 + 证据[引用文档/ADR/代码路径] + 风险 + 改进建议，并标 must / should / nice）

## 1. 模块化与边界纪律
- 这套边界（write boundary / 唯一 dispatch / Public Handle Veil / Effect gate / 双 gate / forbidden-import）每一条是否真正阻止了对应越界？有没有可被绕过的缝隙？
- 边界数量是否接近「guard 疲劳」？哪些 guard 是真安全网，哪些可能是低 ROI 形式主义？
- owning area 划分（Music Experience / Workbench Interface / Agent Runtime / Stage Interface / Music Data Platform）职责是否清晰、有无重叠或真空？

## 2. 高内聚 / 低耦合
- import 方向（Agent Runtime → Workbench Interface seam → area projections）是否单向无环？「Session Context 定义在 in-process read model 而非 wire format」是否真能在 A→C 演进中避免 re-point？
- pi 经「deliberately leaky port」隔离，leak 的方向/程度是否可控？facade 覆盖是否够窄？
- 四套正交 taxonomy（User Signal Class / Speech Level / Effect impact-class×trust-basis / Cascade priority）刻意不合并——是减少认知负担，还是埋下未来被偷偷耦合的雷？

## 3. 长期演进性
- A/B/C、deepest-risk-first、in-process-before-wire 的 sequencing 是否最优？有无更省风险或更快验证的顺序？
- 「contract-stability philosophy」（A 阶段就为 B 预留 revision 列；ConcernRevision「define once at A3, don't abstract early」）是恰到好处的前瞻，还是过度设计/早抽象？
- 哪些是「一次性、改不动」的硬骨头（pi 引擎、Postgres 统一、Session Context 定义点）？现在锁定是否安全？

## 4. 可扩展性
- 加一个新 area / 新 writer / 新 transport 的边际成本？路径是否被现有边界卡住？
- 多 provider 切换（DeepSeek → 其他）在 openai-compatible stream function 后是否真的零边界变更？
- Radio peer actor + supervisor 能否平滑扩展到第三个 agent（如 Mix/Discovery agent）？supervisor 抽象够不够？

## 5. 可测试性
- deterministic in-process harness 能覆盖 Phase B 的并发竞争吗？OCC（two writers racing on a command）如何确定性测试？
- forbidden-import / writer-capability / output-leak 这类 guard 测试，会不会在重构时悄无声息失效？
- LLM 驱动的 agent 行为可测性如何？有无 record/replay、fixture 化 stream function？

## 6. 成熟系统对照复用（逐项判断：该抄 / 借鉴思路 / 自己造，并给理由）
- Main + Radio peer actor + supervisor ↔ Erlang/Akka/Wax actor + supervisor
- projection maintenance（material/catalog projection）↔ CQRS / 事件溯源 / materialized view
- AG-UI Web boundary（Snapshot/Delta、transport resync）↔ Liveblocks / Livekit / Yjs / OT
- pi 引擎 + tool bridge ↔ LangGraph / Claude Agent SDK / Cursor agent loop
- Music Experience History（客观、material-anchored、command 副作用写入）↔ Spotify/Apple Music listening history 与 feedback 闭环
- taste proposal（confirmed proposal 才成 taste）↔ 推荐系统 implicit/explicit feedback、RLHF 式 human-in-the-loop
- 有没有 MineMusic 现在「自己造」但其实已有成熟开源/协议可复用的轮子？

## 7. 产品设计
- 「agent-native 音乐工作台」（对话 + A2UI 卡片 + Radio，弱化传统播放列表 UI）产品命题成立吗？相比 Spotify/Apple Music 的差异化是否足够、是否真为用户所求？
- Proposal Unit（需用户确认的副作用）在音乐场景会不会过重？音乐操作多低风险可撤销，确认阈值如何设？
- 用户能否清晰感知 agent 的「工作过程」（work visibility）？Main 与 Radio 同时活动时 UI 如何不混乱？
- History → taste 的「行为经确认才成口味」对用户是否太隐晦？

## 8. 开创性 / 建设性意见（重点，越多越好，分两层给）
- **A 层 · 框架内开创**：锚定现有能力面（A2UI cards / History 客观基底 / taste proposal / Main+Radio 双 agent / Session Context / Proposal Unit），给可落地的新功能设计。
- **B 层 · 跳出框架**：不受现有架构约束——如果你从零设计一个 agent-native 音乐系统会怎么做、会砍掉 MineMusic 现有哪些东西。**允许「换一个产品形态」级别的提案**，不要自我设限「不能换产品」。

下面是 A 层的候选方向（也欢迎超出此列表、以及任何 B 层方向）。每条建议说明：解决什么用户价值 / 需要哪些新工具或新 area（或要砍掉什么）/ 对现有边界的冲击 / 风险。
- proactive / ambient agent：主动感知场景（时间/天气/活动/日历/生理信号）推音乐
- 多模态音乐理解：哼唱识别、封面与氛围理解、歌词语义、情绪波形
- taste as a living model：可对话、可解释、可被用户质问「你为什么觉得我喜欢这个」的动态口味模型
- 跨平台音乐身份：统一 Spotify/Apple Music/网易云身份与去重
- agent-native 协作：多人共享 session、agent 辅助共建/协商歌单
- 创造型 agent：remix / mashup / 结合 AI 音乐生成
- 音乐知识图谱：理解影响/采样/翻唱/风格谱系，做真正懂音乐的推荐与讲解
- long-term memory continuity：记录用户偏好多年的演化轨迹
- 从「放歌」到「音乐作为其它任务伴随/context」：专注/睡眠/运动场景化
- 你认为我没想到、但 agent-native 形态 uniquely 能做到的方向

## 9. 颠覆性 / 根本前提审视（与维度 8 同级权重，重点）
系统性地挑战本系统的 foundational assumptions，不要默认它们成立。至少覆盖以下层面，每一层都给出明确判断（推翻 / 保留 + 论据）：
- **产品命题**：「agent-native 音乐工作台」本身是不是伪命题？用户是否真想跟 agent 对话来听歌，而不是 Spotify 那样直接刷流？差异化是站得住，还是工程师自嗨？对话+卡片+Radio 三件套是否反而比传统播放器更累？
- **技术选型**：为什么嵌入 pi-agent-core，而不是自建一个最小 loop / 用 LangGraph / Claude Agent SDK？pi 的「版本漂移 + 无 subagent + 无 persistence/compaction」逼出的一堆 MineMusic 自建补丁（Main↔Radio 协调、continuity、OCC），累计成本是否已经超过自建一个轻 loop？Postgres 同时扛 source-of-truth 和 contended runtime state 是否该分库？
- **架构哲学**：六条边界纪律 + 四套正交 taxonomy + contract-stability 预留列 + forbidden-import/writer-capability/output-leak 一堆 guard，是不是过度工程 / 违背 YAGNI？这套纪律防御的真实风险敞口到底多大，还是主要在防御想象中的越界？一个还没验证产品价值的早期系统背上这么重的边界纪律，机会成本是什么、会不会拖死迭代速度？
- **sequencing**：A→B→C、deepest-risk-first 是否真最优？把并发（B）这种最硬的骨头前置，是 de-risk 还是反而拖慢了「先验证用户愿不愿意用」？是否该先用最糙、最没边界的方式跑通产品假设，再回头补纪律？
- **记忆/口味哲学**：「行为必须经 confirmed proposal 才成为 taste」是否过于谨慎，导致 taste 学习太慢、用户体感迟钝、冷启动期像失忆？

每条若主张「推翻」，给：推翻论据 + 替代方案 + 推翻代价。若审完认为某前提确实成立，也明说并给论据——不要为了颠覆而颠覆，但更不要为了礼貌而放过真问题。

# 输出格式（严格遵守）
1. 读完 P0 文档后，先用 ≤5 句话给出你对系统核心架构的理解 + 你识别出的评审重点（对齐检查；若我确认有偏差，纠正后再继续）。
2. 维度 1–7，每个维度给：总体评级（A/B/C/D）+ 3 条最关键发现（每条：结论 + 证据[文档/ADR/代码路径] + 风险 + 改进建议 + must/should/nice）。
3. 维度 8：≥8 条开创性建议（A 层 + B 层），按「用户价值 × 落地难度」四象限排序，每条含四要素。
4. 维度 9：≥5 条颠覆性审视，每条标「推翻 / 保留」+ 论据 + 替代方案/代价；其中至少 2 条为「推翻」级（若你审完认为全部该保留，必须逐条给足论据，不许回避）。
5. 结尾：一份「Top 5 必须现在纠正的风险」清单（只列 must 级，按严重度排序）。

# 评审纪律
- 不客套、不空话（「建议加强测试/文档」之类一律不要）。每个判断要么指向具体系统/论文/产品对照，要么指向具体文档/ADR/代码路径的改动；信息不足就明说「需看 XXX」。
- 凡说「业界一般这么做」，必须点名具体系统/项目/论文，并说明 MineMusic 差异点。
- 区分「事实」与「选型」：pi-agent-core **能力是什么**（有无 subagent / persistence / compaction）是事实，以 audit 原文为准、不要臆测；但**「该不该用 pi」「该不该这么复用」是选型决策，允许被推翻**（见维度 9）。同理适用于其它 ADR 与每一条边界纪律——它们是审视对象，不是豁免对象。
- 区分「bug 级风险」「设计 trade-off」「风格偏好」，不要混为一谈。
- 中文作答，技术术语与标识符保留英文。
```

