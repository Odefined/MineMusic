# MineMusic agent-native 音乐工作台架构与产品评审

评审对象：`Odefined/MineMusic` `main`  
评审日期：2026-06-26  
角色：建设性架构师 + 红队挑战者

---

## 0. 对系统核心架构的理解与评审重点

MineMusic 的目标不是把一个外部 agent 接到音乐应用上，而是把 Agent Runtime 作为产品 runtime 的一等组件：Main/Radio agent 通过 Stage Interface 能力和 Workbench/Session Context 深度参与播放、推荐、Radio 和 UI。Stage Interface 是唯一 agent-facing callable boundary；Workbench Interface 负责 Web 与 embedded agents 共享的 Workspace Snapshot / Protocol / A2UI；Music Experience 拥有播放、队列、Radio、推荐批次与 History；Music Data Platform 拥有 source/material/canonical/owner facts/projections；Effect Boundary 负责权限、proposal 和 side-effect governance。P0 文档的核心主张是“agent 深嵌体验，但 domain truth 仍归 owning area”，评审重点就是检查 Pi、tool、Web、provider、Memory 是否会越权吞掉这些 ownership。第二个重点是 sequencing：A/B/C 的 deepest-risk-first 是否在降低架构风险的同时推迟了产品价值验证。第三个重点是边界纪律：这些 guard 是真正的安全网，还是会演化成早期产品的迭代负担。

---

## 1. 模块化与边界纪律

**总体评级：A-（设计严密；实现仍处于局部落地阶段）**

| 关键发现 | 结论 | 证据 | 风险 | 改进建议 | 等级 |
|---|---|---|---|---|---|
| 1. Stage Interface 的“唯一 dispatch + schema + gate + veil”已经是真实现，不只是文档口号 | 这条边界能阻止大部分 agent/tool 越界：tool lookup、input schema、Effect preflight、handler timeout、declared error、output schema、leak scan都集中在 `dispatch`。 | `src/stage_interface/index.ts` 中 `dispatch` 是唯一工具入口；它校验输入、执行 `executionGate.preflight`、跑 handler、校验输出和 veil。 | Agent Runtime 的 Pi bridge 如果绕开 `dispatch` 或自己解释 tool schema，就会重建第二条 admission path。 | Phase A 必须加“pi tool bridge 只能调用 `StageInterface.dispatch`”的 architecture test；不允许 direct handler call。 | must |
| 2. Public Handle Veil 已经较强，但 Web/A2UI 阶段的生命周期与授权还没落地 | 当前 `MusicItemHandle` 只有 `material/candidate` opaque id；`MusicCard` 不暴露 internal refs；测试覆盖 materialRef/sourceRef/resultSetId/providerEntityId 泄漏。 | `src/contracts/stage_interface.ts` 定义 opaque handle；`test/formal/stage-interface-tool-frame.test.ts` 拒绝 `materialRef` 等泄漏。 | Phase C 会引入 Web 共享 handles、A2UI actions、proposal handles；一旦把 public handle误当 bearer object capability，会造成越权 action。 | 在 C1/C2 前实现 `PublicObjectRef` lifecycle test：ownerScope、workspace、handleKind、allowed operation、expiry、principal 必须全部参与 resolve。 | must |
| 3. guard 数量接近 guard fatigue | `write boundary / dispatch / Public Handle Veil / Effect gate / double gate / forbidden-import / output-leak / writer-capability / 四套 taxonomy` 都有合理来源，但开发者认知负担高。 | Roadmap 明确四套 taxonomy 并强调不要合并；CLAUDE.md 又规定 errors/fallbacks、write boundary、output rules。 | 后续 PR 可能为了“满足 guard”机械加测试，真正风险反而没人看；也可能相反，大家绕开 guard。 | 做一张 `Boundary Risk Matrix`：每条 guard 只绑定一个具体 failure mode；低 ROI 的 guard 合并成 contract snapshot / import graph，而不是继续堆规则。 | should |

**缝隙判断：**

- 真安全网：唯一 `dispatch`、output veil、Stage/Domain forbidden imports、writer-capability guard、source-provider output validation、owner catalog DB projection。
- 容易形式主义：四套 taxonomy 如果没有“classification at boundary”的测试表，会变成术语负担；file-list 式 active-tree guard 维护成本会随代码增长上升。
- owning area 划分整体清晰，但 `present` candidate commit 的文档语义存在冲突，见 Top 5 风险。

---

## 2. 高内聚 / 低耦合

**总体评级：B+**

| 关键发现 | 结论 | 证据 | 风险 | 改进建议 | 等级 |
|---|---|---|---|---|---|
| 1. import 方向在设计上单向，但当前 guard 有一部分是 brittle file-list | 架构要求 Domain 不 import Stage Interface，Stage Core 只 composition；测试有 root/file list 和 contracts DAG。 | `ARCHITECTURE.md` Import Direction；`test/formal/active-tree.test.ts` 有 root/file-list/contract DAG guard。 | file-list guard 会在正常扩展时频繁更新，容易被“改快点”弱化。 | 加 AST/import graph rule：按 owner area 与 `stage_adapter` 例外判定，而不是靠完整文件名单。 | should |
| 2. Session Context 定义在 in-process read model 之上是正确方向 | A2 明确把 Workbench read-model composition 与 Agent Runtime Session Context 分成两个 artifacts，Phase C 只扩展 composition，不 re-point Session Context。 | Phase A spec A2 Deep Dive。 | 该 seam 尚处 planning；若实现时为了快直接从 AG-UI/DTO 拼 prompt，会破坏 A→C 演进。 | A2 第一 PR 只做最小 read-model seam + prompt injection，并加“no AG-UI type reachable”测试。 | must |
| 3. Pi port 的 leak 是必要的，但必须持续被收窄 | Pi audit 证明低层 `Agent` 没有 persistence/compaction/subagent；MineMusic 需自己建 transcript persistence、Radio coordination、OCC。 | Pi audit：low-level Agent volatile，无 subagent；pi harness reuse note：不采用 full AgentHarness。 | “deliberately leaky port”可能逐步变成 raw pi API 扩散，尤其是 compaction/session helpers。 | 只允许 `src/agent_runtime/engine_adapters/pi/**` 和 facade 测试 import raw pi；加 version-pinned conformance tests。 | must |

**四套 taxonomy 判断：**不合并是对的，因为它们分类对象不同：user action meaning、agent speech severity、effect permission、actor preemption。风险是开发者把它们都塞进一个 command envelope。建议每套 taxonomy 必须有唯一 entry assignment point 和一张 examples table。

---

## 3. 长期演进性

**总体评级：B**

| 关键发现 | 结论 | 证据 | 风险 | 改进建议 | 等级 |
|---|---|---|---|---|---|
| 1. A/B/C 是架构风险优先，不是产品验证优先 | Roadmap 先 Main in-process，再 Radio/OCC，再 Web/human，逻辑上降低 concurrency/transport 风险。 | Roadmap 的 sequencing principle：one concurrent writer per phase，in-process before wire。 | 用户是否想要“agent-native 音乐工作台”会到 Phase C 才被真实验证，可能架构做深但产品命题不成立。 | 并行做 C0：只读 Web prototype / Wizard-of-Oz Radio / fake A2UI，不进入 formal write path，只验证用户行为。 | must |
| 2. `ConcernRevision` 提前埋列是合理前瞻 | A3 加 revision，B 才 CAS enforcement；PB3 细化为 per-concern revision，避免 queue reorder void Radio append。 | Phase A A3 和 Phase B PB3。 | 如果过早抽象成 generic version vector，会引入分布式 causality 误解。 | 按 PB3 命名为 `CommandPreconditionSet` + `ConcernRevision`，不要叫 version vector。 | should |
| 3. 几个硬骨头已经接近“锁死” | Pi engine、Postgres 统一、Session Context 定义点、Stage Interface tool descriptor 是一旦落地很难改的结构。 | Architecture / Phase A / Pi audit / Current State。 | 早期锁得太死会拖慢 pivot；锁得太松会边界腐烂。 | 每个硬骨头写 exit criteria：Pi churn、DB contention、prompt size、tool selection failure 触发复盘。 | must |

---

## 4. 可扩展性

**总体评级：B+**

| 关键发现 | 结论 | 证据 | 风险 | 改进建议 | 等级 |
|---|---|---|---|---|---|
| 1. 新 area / writer 的边际成本高但可控 | 新 writer 必须有 command boundary、projection、revision、Effect posture、Stage adapter、guards。 | Architecture top-level area table；CLAUDE.md write rules。 | 成本高会抑制小功能试验；团队可能在旧 area 偷塞功能。 | 提供 `area onboarding checklist` 和模板：contracts、ports、commands、stage_adapter、guard。 | should |
| 2. 多 provider / model 切换不是零成本 | Pi audit 证明 OpenAI-compatible/DeepSeek 可通过 descriptor/baseUrl/key 切换，但 tool-call schema adherence 仍是模型行为问题。 | Pi audit E1-E3。 | “边界不变”不代表“产品行为不变”；模型可能不按 schema 或不理解 tool descriptions。 | 加 provider/model conformance suite：schema adherence、tool selection、stream error、abort behavior。 | must |
| 3. Radio peer actor 能扩展到第三 agent，但需要抽象 actor registry | PB9 的 abort priority `user > Main > Radio` 是 hardcoded 三方关系；第三 agent 会让 priority/basis dependency 更复杂。 | Phase B PB9。 | Mix/Discovery agent 加入后，手写级联会膨胀，出现错误 abort 或 stale commit。 | 在 B 完成前抽出 `AgentActorDescriptor { actorId, priority, concernsRead, concernsCommit }`，但不要提前做完整 workflow engine。 | should |

---

## 5. 可测试性

**总体评级：B**

| 关键发现 | 结论 | 证据 | 风险 | 改进建议 | 等级 |
|---|---|---|---|---|---|
| 1. Phase B 的 deterministic harness 方向正确 | PB harness 分 command correctness 和 pi wiring 两层；OCC race 由测试显式编排，不靠两个 LLM 真并发。 | Phase B Cross-Cutting Harness。 | 如果只测 “two real loops collide”，结果会 flaky，不能证明 correctness。 | 必须先落 command-layer CAS tests：basis N、steer bump N+1、append basis N => `voided_stale`。 | must |
| 2. 现有 guard 测试有价值但需要升级 | active-tree guard、Stage output leak guard、schema tests已存在。 | `active-tree.test.ts` 和 `stage-interface-tool-frame.test.ts`。 | file-list guard 容易被维护成本稀释；schema snapshot 变化会影响 agent 行为但未必被审查。 | 增加 contract-generated eval：description/useWhen/examples/errors/allowedActions 变化自动要求 eval review。 | should |
| 3. LLM-driven behavior 还需要 record/replay | 文档提到 stubbed LLM stream；代码层还未看到 Agent Runtime。 | Phase B harness spec；Pi audit。 | 没有 deterministic stream fixtures，Main/Radio 行为无法回归测试。 | AgentEngine 测试使用 scripted stream function：tool-call sequence、tool error、abort、stale result、retry。 | must |

---

## 6. 成熟系统对照复用

**总体评级：B+**

| 对照项 | 判断 | 理由 | MineMusic 差异点 | 建议 |
|---|---|---|---|---|
| Main + Radio peer actor + supervisor ↔ Erlang/Akka/Wax actor | 借鉴思路 | Radio supervisor 的 single-flight、low-watermark、restart/backoff 是 actor/supervisor pattern。 | MineMusic 不需要完整 OTP；它需要 per-concern OCC 与 product truth。 | 借鉴 supervisor tree / mailbox / backoff；不要引入完整 actor framework。 |
| Projection maintenance ↔ CQRS / materialized view | 该抄 | owner catalog/search metadata 已是 DB projection/read model。 | Music Experience History 明确不是 event-sourced v1。 | 抄 materialized view、dirty target、rebuild runner；暂不强行 event sourcing。 |
| AG-UI boundary ↔ Liveblocks / LiveKit / Yjs / OT | 借鉴 AG-UI；不抄 CRDT/OT | Snapshot/Delta/ActionEnvelope 更适合 agent UI；domain writes 不是 collaborative text editing。 | MineMusic 多 writer 是 command/OCC，不是 CRDT merge。 | AG-UI 做 projection transport；Liveblocks/Yjs 只可用于 presence/layout，不能做 domain truth。 |
| Pi + tool bridge ↔ LangGraph / Claude Agent SDK / Cursor loop | 自己造控制层，复用 Pi loop | Pi 提供 engine/tool loop；无 subagent/persistence/OCC。 | MineMusic 的 Radio、Effect、Workbench 需要 product-owned runtime。 | 保留 `AgentEngine` port；Pi 只是 adapter，可替换。 |
| Music Experience History ↔ Spotify/Apple listening history | 借鉴闭环 | Objective history、exposure/play/skip 是推荐系统基本信号。 | MineMusic 不直接把行为转 taste，而是 proposal evidence。 | 保留 objective history；增加 provisional taste hypotheses。 |
| taste proposal ↔ implicit/explicit feedback / RLHF HITL | 借鉴思路 | confirmed proposal 提高用户可控性。 | 如果所有行为都等确认才影响体验，系统学习太慢。 | durable Memory 需确认；ranking 可用透明 provisional signal。 |
| 自己造轮子 | 局部风险 | AG-UI、pg-boss、Postgres 已复用；但 Agent Runtime supervisor / handle registry / eval generator 仍会自建。 | 这些部分和音乐产品强绑定，合理自建。 | 不自建通用 CRDT、workflow engine、observability；用 OpenTelemetry/pg-boss/AG-UI 等成熟件。 |

---

## 7. 产品设计

**总体评级：B-**

| 关键发现 | 结论 | 证据 | 风险 | 改进建议 | 等级 |
|---|---|---|---|---|---|
| 1. “agent-native 音乐工作台”差异化成立，但 chat-first 不成立 | PRD 的差异化在 Radio、可解释推荐、共享 workspace、taste control；不是“用户用聊天替代播放器”。 | PRD 固定 Chat + Playback；Radio 与 shared workspace。 | 普通用户打开音乐 app 想快速听，不想管理 agent 工作台。 | 产品入口改为 Radio/ambient playback first；Chat 作为 steer/explain/repair 层。 | must |
| 2. Proposal Unit 在音乐场景必须轻 | 音乐动作大量可撤销、低风险；Effect Boundary 现在已有 owner-relation/collection/user-requested auto-pass。 | Effect gate code 对 presentation/library intake/relation/collection 有 auto-pass。 | 过多确认会让产品像 admin console。 | 只有 external-or-irreversible、跨平台写、批量删除、隐私敏感行动需要 Confirm；本地 save/favorite/block 默认 auto + undo。 | must |
| 3. work visibility 要显示“意图与结果”，不是工具日志 | PRD 不想展示完整工具 log；只需要轻量 status 和相关 cards。 | PRD Work visibility section。 | Main 和 Radio 同时活动时，若都以 chat/tool log 形式出现，用户会混乱。 | 建双泳道 UI：Conversation lane（Main）+ Ambient/Radio lane；Radio 默认 Silent/Notify，异常才 Speak。 | should |

**History → taste 隐晦性判断：**当前“行为经 confirmed proposal 才成 taste”适合隐私/控制，但必须在 UI 暴露“provisional hypotheses”：例如“我注意到你最近常完整听完 90s trip-hop，要不要把它记入口味？”否则用户只会感觉系统迟钝。

---

## 8. 开创性 / 建设性建议

### 四象限排序

#### 高用户价值 × 低/中落地难度：优先做

| 建议 | 层 | 用户价值 | 新工具/area 或要砍掉什么 | 边界冲击 | 风险 |
|---|---|---|---|---|---|
| 1. Affordance-rich MusicCard：每个 handle 带下一步可做动作 | A | agent 不用猜下一步，用户看到“播放/保存/不喜欢/更多类似” | 扩展 Stage output `allowedActions` 到 per-item affordances；Workbench 渲染 action chips | Stage Interface + Workbench handle/action mapping | action 过多会噪声；需按 context 裁剪 |
| 2. Provisional Taste Hypotheses | A | 系统学习更快，用户可纠正“你为什么觉得我喜欢这个” | Music Experience History read + Memory proposal surface；新增 `taste.hypothesis.*` read/confirm tools | Memory 消费 History，但不拥有 raw History | 错误推断可能冒犯用户；需透明和一键否认 |
| 3. Radio Direction Capsule | A | 用户能用极少交互调整 Radio：“更暖一点/少一点 live/回到刚才那种” | Music Experience radio motif/variations commands；Radio Card | Music Experience owns truth；Main/Radio 只通过 command | vocabulary 过早复杂化；先用 motif + active variations |
| 4. Stage Episode | A | “第二个”“刚才那组”“不要这个方向”可稳定引用 | Agent Runtime episode store：tool calls、handles issued、commitments、unresolved questions | Agent Runtime owns episode; Workbench projects compact trace | 可能变成 tool log；只暴露 user-meaningful trace |

#### 高用户价值 × 高落地难度：战略押注

| 建议 | 层 | 用户价值 | 新工具/area 或要砍掉什么 | 边界冲击 | 风险 |
|---|---|---|---|---|---|
| 5. Cross-platform Music Identity Inbox | A | 统一 Spotify/Apple/NCM/local，解决重复版本和迁移痛点 | Provider account/config/secrets；Canonical evidence review；identity conflict inbox | Extension + MDP canonical maintenance + Effect Boundary | 授权/API限制；identity merge 错误成本高 |
| 6. Music Knowledge Graph | A | 推荐解释从“相似”升级到“影响/采样/翻唱/场景谱系” | Knowledge Provider slot；music.knowledge.explain tool | Music Intelligence/Knowledge 只读，不写 identity | 数据质量和版权/来源 attribution |
| 7. Multimodal Lookup | A | 哼唱、歌词片段、封面氛围、情绪波形找歌 | 新 Source/Knowledge providers；audio/image embedding store | Music Intelligence retrieval expands; MDP still owns durable identity | 高成本、隐私和模型误识别 |
| 8. Collaborative Agent Session | A | 多人聚会/车载/工作室共建歌单，agent 调停冲突 | Workbench multi-principal session；proposal/vote action | Workbench Interface + Effect Boundary + Music Experience | 权限/并发复杂度显著上升 |

#### 中用户价值 × 低落地难度：打磨体验

| 建议 | 层 | 用户价值 | 新工具/area 或要砍掉什么 | 边界冲击 | 风险 |
|---|---|---|---|---|---|
| 9. “Why this next?” micro-explanation | A | Radio 更可信，用户更愿意 steer | Radio append result携带 basis summary；MusicCard 展示 reason | Agent-generated summary 不得成为 History fact | 解释可能胡编；需 evidence-bound |
| 10. Capability Inventory with Freshness | A | agent 知道当前能搜哪里、哪些 provider 不可用 | `stage.capabilities.list` 或 `music.discovery.list_scopes` 扩展 freshness | Extension exposes compact provider health, no secrets | 不应在 read-only list_scopes 里 probe provider |

#### 跳出框架：产品形态级提案

| 建议 | 层 | 用户价值 | 要砍/新增 | 边界冲击 | 风险 |
|---|---|---|---|---|---|
| 11. Radio-first Ambient DJ，而不是 Workbench-first | B | 最接近真实听歌需求：打开就听，轻量 steer | 砍掉首屏复杂 Chat/workbench；保留 Chat 为解释/纠错 | Workbench 变成后台/侧栏，Music Experience 更中心 | 牺牲“agent workbench”叙事，但更像产品 |
| 12. Music-as-Context OS | B | 音乐服务于专注/睡眠/运动/通勤，不只是找歌 | 新 Context area：calendar/weather/activity/biometrics adapters | 高隐私；Effect/Data Egress 必须更强 | 数据授权和误用风险 |
| 13. Creative Remix / Transition Agent | B | 从推荐进入创造：mashup、transition、AI-generated bridge | 新 Creative Experience area；外部生成 provider | 版权/外部效果必须走 Effect Boundary | 法律和版权高风险 |
| 14. Longitudinal Taste Diary | B | 多年口味演化、年度回顾、人生阶段音乐记忆 | Memory + History long-term visualizations | History retention已支持；Memory summaries separate | 可能过度私人化；需可删除/可导出 |

---

## 9. 颠覆性 / 根本前提审视

| 前提 | 判断 | 论据 | 替代方案 | 推翻/保留代价 |
|---|---|---|---|---|
| 1. “agent-native 音乐工作台”是否应 chat-first | 推翻 chat-first；保留 agent-native | 用户听音乐的默认行为是即时播放和轻量 steer，不是和 agent 讨论。PRD 的强点是 Radio、cards、shared workspace，而不是 chat 本身。 | Radio-first / ambient-first：Chat 是 steer、repair、explain 层。 | 牺牲部分“通用 agent”展示；需要更强 playback UX。 |
| 2. A→B→C deepest-risk-first 是否唯一最优 | 推翻“唯一最优” | B 的并发/OCC 是硬骨头，但真实用户价值要到 C 才验证。早期系统可能先证明了复杂 architecture，却未证明用户愿意用。 | 并行 C0：read-only Web prototype、fake Radio、Wizard-of-Oz cards；不接正式 write path。 | 需要维护一个可丢弃 prototype，并防止它污染正式架构。 |
| 3. 行为必须 confirmed proposal 才能成为 taste | 推翻“任何 taste-like 影响都必须确认” | Durable Memory 需确认是对的；但 ranking 和会话体验如果完全不使用隐式行为，会冷启动慢、像失忆。 | History 产生 provisional/session taste hypotheses；durable editable taste 仍需确认。 | 需要解释 UI 和否认机制；错误猜测风险上升。 |
| 4. Pi-agent-core 是长期技术路线 | 保留为 engine；不保留为战略平台锁定 | Audit 显示 Pi 是好 loop，但无 subagent、低层 Agent 无 persistence/compaction/endurance，高 churn。 | 保持 `AgentEngine` port；设熔断：版本 churn/adapter complexity/abort conformance失败时切换 LangGraph、OpenAI Agents SDK 或自建轻 loop。 | 维护 adapter 与 conformance suite；换 engine 时有 migration 成本。 |
| 5. 六条边界纪律 + 四套 taxonomy 是不是过度工程 | 保留核心边界；推翻无限增殖 | dispatch/gate/handle/write boundary 是真实风险控制；taxonomy 不加边界 assignment 测试会变成形式主义。 | Guard Risk Matrix + contract-generated eval；每条 guard 必须绑定 failure mode。 | 少数边缘越界可能不被专门 guard 捕获；但认知成本下降。 |
| 6. Postgres 同时承载 facts 和 runtime state | 保留当前选择，设拆分条件 | Postgres 已是项目 norm；queue/runtime state 需要 revision 和 reconnect survival。 | schema/transaction/lifecycle 隔离；若 queue contention、retention、multi-instance pacing出现瓶颈，再拆 runtime-state store。 | 现在拆库会过早增加运维复杂度；不设拆分条件会形成隐性耦合。 |
| 7. Proposal Unit 在音乐场景是否必要 | 保留高影响 Proposal；推翻泛确认 | 音乐多数本地动作可撤销；过多 confirm 会破坏流。 | Low-risk local actions auto-pass + undo；external/irreversible/bulk/隐私敏感才 Proposal。 | 自动操作需强 audit 和用户可撤销。 |

---

## Top 5 必须现在纠正的风险

1. **修正 Candidate Commit / Present 的语义冲突。** `ARCHITECTURE.md` 说 `present` 会把 candidate “admit to library before presentation”，但 Phase B PB4/PB6 明确 candidate commit 只创建 durable material，不污染 library/catalog。必须统一成“commit to material identity”，library admission 只能由 explicit save/import/relation/collection command 完成。
2. **Agent Runtime 接 Pi 前必须有 pin + re-audit + conformance tests。** Pi 0.79.10 高 churn、低层 Agent 无 persistence/compaction/subagent；必须锁版本、限制 raw imports、测试 abort/signal/hook/tool-error behavior。
3. **Phase C 前必须实现 PublicObjectRef lifecycle/authorization guard。** Handle 不是 bearer capability；Web/A2UI action 必须重新验证 ownerScope、workspace、principal、kind、lifecycle、allowed action。
4. **Phase B 前必须先落 command-layer CAS tests。** OCC correctness 不能靠两个 LLM 真并发；必须测试 `CommandPreconditionSet` 的 zero-row `voided_stale` 和 abort-signal plumbing。
5. **不要等到 C 才做产品命题验证。** 并行 C0 read-only/Wizard-of-Oz prototype 验证用户是否接受 Radio/cards/work visibility；否则可能把最难的架构做完后才发现 chat/workbench 形态过重。

---

## 最终判断

MineMusic 的架构文档和已落地代码体现了罕见的边界自觉：provider 不生产 material/card，Stage Interface 是唯一 agent tool router，Music Data Platform 做 identity/projection，Music Experience 拿回播放/Radio truth，Pi 被限制在 AgentEngine 位置。这套方向在架构上是可信的。红队结论是：最大的风险不是“系统会失控”，而是“系统太早把复杂边界做成了产品本体”。把 Chat 从主入口降级为 steer/explain/repair，把 Radio 和轻量 cards 提升为主体验，并并行做 C0 用户验证，是当前最重要的产品纠偏。
