# MineMusic Agent-Native 架构评审 — 处置结论（Disposition）

> Status: 产品/架构 grill 处置记录。
> 对象: `docs/product/MineMusic_agent_native_arch_product_review_2026-06-26.md`（ChatGPT 评审）。
> 性质: 逐条 accept / absorb / reject 判定，grounded 在 repo 一手验证 + 产品 grill（2026-06-26）。
> 不是新架构权威；落地动作仍走各自 owning doc / ADR / issue。

## 0. 方法与核心发现

11 个事实声明簇逐条对 repo 文档/代码做对抗式验证（10 条并行 workflow + pi 一条直读 audit 原文）。

**核心发现 A（系统性偏差）**: review 事实命中率高，但常把 **Accepted ADR / spec 当成已落地代码**。review 说「现在已……」处需核实是代码行为还是设计意图。受影响: ADR-0038 二维 Effect gate、四套 taxonomy、Phase-C PublicObjectRef、History/taste——在 `src/` 全是零代码或仅旧实现。

**核心发现 B（反向偏差）**: review 把三条**早已决定/已接好**的事当成 open gap: candidate commit 冲突（ADR-0040 已裁定 + 已落代码）、Postgres 拆分（config 已接好）、PublicObjectRef bearer（Phase C spec 已写明）。

## 1. 必须接受（事实成立 + 可执行）

| # | review 意见 | 证据 |
|---|---|---|
| A1 | §1.1 `dispatch` 是唯一工具入口；Phase A 必加「pi tool bridge 只能调 `StageInterface.dispatch`」architecture test | `src/stage_interface/index.ts:97-99,143-262`（六步）; `src/server/host.ts:196` + `src/server/transports/mcp_stdio_driver.ts:212` 都走 dispatch |
| A2 | §2.1 active-tree guard 是脆弱 file-list → 应换 AST/import-graph | `test/formal/active-tree.test.ts:6-65,85-240,241-276`（~60 removed-roots 黑名单 + per-owner 枚举 ~155 文件 + contracts-only DAG） |
| A3 | Top5#2 / §9.4 pi 高 churn、低层 Agent 无 subagent/persistence/compaction；锁版本 + re-audit + conformance + 熔断 | pi audit C4/A3/F2；pi 尚未进 `package.json`（Phase A 才引入） |
| A4 | Top5#4 Phase B 前落 command-layer CAS 测试 + scripted stream fn | Phase A/B/C 均 Planned；**要的测试设计已在 spec 锁定** `docs/formal-rebuild/phase-B-radio-concurrency-spec.md:543-567` |
| A5 | §6 History 非 event-sourced、command 副作用写入、客观 material-anchored、不直接转 taste | `docs/formal-rebuild/music-experience-history-spec.md:167-176,186-193,26-30,42-46`; ADR-0041 decision 3 |

## 2. 可以吸收（方向对，纠正框架）

| # | review 意见 | 必须纠正 | 证据 |
|---|---|---|---|
| B1 | §7.2/§9.7 Effect gate「现在已」auto-pass；Proposal 只留高影响；本地动作 auto+undo | auto-pass 属实（per-scenario booleans）。但「impact-class×trust-basis 二维」+「auto+undo」+「Proposal Unit park/confirm」是 ADR-0038/0034/0041 **设计意图，非代码**。现网 gate = ADR-0010 三轴 + 4 个 per-scenario booleans，决策集仅 `allow\|ask\|deny`，issue #115 OPEN | `src/effect_boundary/stage_tool_execution_gate.ts:69-146`; `src/contracts/stage_interface.ts:28-44`; src/ 全树零 `ownerCurationWrite`/`impactClass` |
| B2 | §1.3/§9.5 四套 taxonomy 有 guard-fatigue 风险，每套要 entry-assignment + examples table | 方向对，但**四套 taxonomy 现在全是 spec 文本、零代码**——还不存在「对工作代码的形式主义」。review 点名的多数 guard（dispatch/veil/forbidden-import/writer-capability）是真落地代码。entry-assignment 纪律在 Phase A/B/C 生出它们时才关键 | `docs/formal-rebuild/agent-native-workbench-roadmap.md:161-174`; src/ 无任何 enum/test |
| B3 | Top5#3 C1/C2 前实现 PublicObjectRef lifecycle/authz guard | 实质对，但是**前瞻 must**: Phase C Planned、零代码。bearer-capability 点 Phase C spec 自己已写明 `docs/formal-rebuild/phase-C-web-boundary-spec.md:48-59`。今天 `HandleMintingPort` 已做 ownerScope+handleKind+publicId+expiry（6 维里 3 维），缺 workspace/principal/operation | `src/stage_interface/handle_minting.ts:135-213` |
| B4 | §9.6 保留 Postgres 统一、设拆分触发条件 | **拆分能力已接好**: `src/server/config.ts:68-81` 已有独立 `backgroundWork.database.{url,schema,maxConnections}`；pg-boss 表已在独立 `pgboss` schema。缺的只是拆分阈值策略，不是拆分能力 | `src/server/config.ts:53-81`; pg-boss `DEFAULT_SCHEMA='pgboss'` |

## 3. 需要驳回（已是决策 / 已接好 / 稻草人）

| # | review 意见 | 为什么驳回 | 证据 |
|---|---|---|---|
| R1 | Top5#1 candidate commit / present 是「未解决冲突，必须统一为 commit to material identity」 | **ADR-0040（Accepted）已裁定**: candidate commit 落 durable material、不入 library。**代码已落地**: `library` item-kind 已从 MusicItemHandle 退役，handle registry 只认 `material\|candidate`，`present.ts` 发 `handleKind:'material'`。review 提的「统一目标」就是既成决策。唯一真未做: `ARCHITECTURE.md:423-426` 一句 stale 措辞 + #113 `durableUserStateWrite:true` 粗 flag | ADR-0040:9-34,61-64; `src/contracts/stage_interface.ts:595-607`; `src/stage_interface/handle_registry_records.ts:3,167-169`; `src/music_experience/stage_adapter/present.ts:43,103,170,205` |
| R2 | §9.1/§7.1「推翻 chat-first」 | **半稻草人**: PRD 已写「Neither Chat nor Radio is the primary root」(line 70-72)、「Chat must not become the only main experience」(line 81)。真分歧只是首屏默认——而首屏 autoplay 已被 grill 否决（见 §4-J1），剩 Radio Card 视觉优先属可延后 layout | `docs/product/music-agent-workbench-prd.md` line 70-72, 81, 86-94, 700 |
| R3 | §9.5「六条边界纪律是否过度工程 / 防御想象中的越界」 | 6 条里多数（dispatch/veil/forbidden-import/writer-capability/effect-gate）是**正在生效的落地代码**，不是纸面规则。「过度工程」只真切适用于未落地的四套 taxonomy + 真脆弱的 file-list guard。一锅端低估了 dispatch/veil 的实际拦截 | 见 A1/A2/B2 |

## 4. 产品 grill 决策

**J1 冷启动首屏 — 驳回 review §9.1「推翻 chat-first → Radio-first ambient DJ」。**
- autoplay 否决——但**严格限定为「打开软件即播放声音」这一个行为**，**不是**「系统不能基于推断行动」的一般原则（grill 中曾误外推到 taste，已被用户纠正）。
- PRD co-present 模型成立: Chat + Playback 恒在、Radio Card 作 home 上 one-tap motif 入口（PRD line 404-419 已是）。
- Chat 取 PRD peer pane（不降级为后台层）。
- 冷启动视觉锚点优先级 = 可延后 layout（PRD line 700）。

**J2 C0 并行原型 — 驳回 review Top5#5。**
- 不跑 read-only Web / Wizard-of-Oz Radio / fake A2UI 并行原型。
- Phase A 落地后用 PRD acceptance stories（line 663+）dogfood 自测；B 的启动挂 A 的 dogfood 结论（吸收 review「验需求再啃硬骨头」的意图，但用真 Phase A 替代假 C0）。

**J3 taste provisional — 驳回 review §9.3。**
- 维持严格 ADR-0041: durable taste 只从 confirmed proposal 生长。
- review 担心的「失忆」大半被「客观 History 当最近上下文」（非 taste，PRD 已有: queue continuity、ask-for-more-like-this）覆盖；剩下「跨 session 未确认排序」正是 ADR-0041 自己甩给 Memory phase 的 open fork（lines 96-101）。
- History spec **不预留** transient-ranking read seam，只喂 confirmed-proposal 生成（don't abstract early）。

**J4 §8 建设性建议 — 除 #2（J3 驳回）、#11（J1 抽柱）外，全部 backlog；Phase A 不预留任何 contract hook。**
- #1 Affordance-rich MusicCard: 到 Phase C（A2UI / ADR-0034）做时，per-item `allowedActions` 必须是按 context 裁剪的枚举，不得 dump 全量动作池（违 CLAUDE.md「Agent-Facing Output 要 compact」）。现在 MusicCard（`contracts/stage_interface.ts:221-236`）无 reason/allowedActions 字段，别现在加。
- #4 Stage Episode: 到时注意别退化成 tool log（review 自己也警告了）。
- #5 跨平台身份: 跟既有 local-source / canonical 工作同一条线，真要做时是它的延伸。
- B 层换产品形态（#12 Music-as-Context OS、#13 Creative Remix）不在当前范围；#14 Longitudinal Taste Diary 与 J3 严格 durable taste 一致，是 Memory phase 自然产物。

## 5. 落地动作（真正要做的少数几件）

| 动作 | 归类 | 来源 | owning |
|---|---|---|---|
| ✅ 改 `ARCHITECTURE.md:423-426` stale「admit to library」措辞 → 按 ADR-0040（**已落地**: 「commit the candidate to a durable material identity before presentation」，引 ADR-0040；library admission 只走 explicit save/import/relation/collection） | 驳回 R1 框架 / 落地其真实余项 | R1 | ARCHITECTURE.md |
| #113 `present.ts` `sideEffect.durableUserStateWrite:true` 粗 flag 细化 → 随 ADR-0038 `ownerCurationWrite` | **不归 review 账**（repo 自带 follow-up，验证 R1 时挖出） | R1 余项 | issue #113 |
| active-tree guard file-list → AST/import-graph（按 owner area + stage_adapter） | **§1 必须接受** | A2 / §2.1 | `test/formal/active-tree.test.ts` |
| ✅ Phase A「pi tool bridge 只能调 `StageInterface.dispatch`」forbidden-import test — **已在 spec**（phase-A L72-73 A1 Guards + Exit Criteria L609） | **§1 必须接受** | A1 / §1.1 | Phase A spec |
| ✅ pi 锁版本 + re-audit-on-bump（**已在 spec**：phase-A L159-163 / L543-551 / L615-618）+ abort/signal/hook/tool-error **conformance suite 自动化**（已补入 phase-A Open Questions） | **§1 必须接受** | A3 / Top5#2 | Phase A spec |
| Phase B 前 command-layer CAS 测试 + scripted stream fn（已 spec 锁定） | **§1 必须接受** | A4 / Top5#4 | Phase B spec |
| ADR-0038/#115 二维 Effect gate 落地（当前是 ADR-0010 三轴） | **§2 可以吸收** | B1 | issue #115 |

## 6. 未改变（review 没动到的既成立场）

- PRD co-present 模型（Chat + Playback 恒在、Radio Card one-tap 入口、冷启动不出声）。
- 严格 ADR-0041（durable taste = confirmed-only）。
- A/B/C sequencing（deepest-risk-first）；仅 B 启动挂 A 的 dogfood 结论。
