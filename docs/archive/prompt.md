> Status: Archived
> Archived on: 2026-06-06
> Superseded by: `MineMusic_Formal_Project_Architecture_Audit_v3.md`, `docs/formal-rebuild/`, `docs/formal-project-glossary.md`
> Use only for: original external-audit prompt evidence
> Related audit: `MineMusic_Formal_Project_Architecture_Audit_v3.md`

你是一个 principal engineer / software architect，任务是对 MineMusic 从 MVP 阶段转向正式项目做一次完整、严厉、证据驱动的架构审计。

项目路径：https://github.com/Odefined/MineMusic

项目核心定位：

MineMusic 是一个**可扩展**的音乐 agent 脚手架和工作台（harness），让通用 LLM 能变成用户的私人音乐生活助理伙伴。一切的架构抽象思路都是为了这个核心服务，一切可以阻碍向这个定位发展的设计都应该彻底重构。

背景：

MineMusic 的 MVP 已经验证了不少产品方向和工程思路，也有一些值得保留的设计与代码。但 MVP 现在已经很难继续维护和迭代，已知存在的问题包括但不限于：

- 核心对象命名不一致、不规范；
- 读能力、写能力、查询能力、物化能力封装混乱；
- 数据操作管线彼此纠缠；
- 数据库操作缺少统一入口；
- 查询操作自己拼接流程，而不是复用清晰的数据库/存储能力；
- bounded context、port、capability、Stage Interface 等边界需要重新确认；
- provider插件内部细节泄露，丧失可插拔性；
- 可能还有其他我没有列出的结构性问题。

你的目标不是做普通 code review，而是写一份“从 MVP 迁移到正式项目”的完整技术报告：

0. 为了达成项目的核心定位目标，应该留下什么，应该抛弃什么，应该修改什么，应该增加什么。
1. 取其精华：哪些设计、代码、模块、接口、测试、文档思想值得保留、复用或迁移？为什么？
2. 去其糟粕：哪些核心架构、功能模块、命名、管线、数据访问方式必须重构或删除？问题是什么？
3. 给出正式项目应采用的目标架构、重构路线、PR 切片、验收标准和测试/架构守卫。

工作方式要求：

- 先读真实仓库，不要凭猜测输出。
- 优先阅读：
  - AGENTS.md
  - INDEX.md
  - README.md
  - ARCHITECTURE.md
  - CURRENT_STATE.md
  - PROGRESS.md
  - docs/stage-interface/design.md
  - docs/stage-interface/progress.md
  - docs/material-search/design.md
  - docs/material-search/progress.md
  - docs/material/material-resolve-query-plan.md
  - src/contracts/index.ts
  - src/ports/index.ts
  - src/stage_core/index.ts
  - src/stage_interface/**
  - src/stage_interface/tool_definitions/**
  - src/stage/**
  - src/material/**
  - src/handbook/index.ts
  - package manifests, test config, architecture tests
- 如果某个文件不存在，说明它不存在，然后继续用仓库里实际存在的权威文件。
- 必须区分：
  - 仓库事实；
  - 代码证据；
  - 文档证据；
  - 推断；
  - 建议。
- 必须直接挑战当前架构、命名和边界，不需要为了尊重 MVP 历史而迁就错误设计。
- 不要给泛泛建议，例如“加强抽象”“提高解耦”。每条建议必须说明：
  - 当前输入场景是什么；
  - 当前代码如何处理；
  - 预期正式项目应该如何处理；
  - 现在会防不住什么错误；
  - 应改到哪个 bounded context / port / module；
  - 应加什么测试或架构守卫。
- 当前本地数据可以视为开发/测试数据。不要为了兼容 MVP 旧字段、旧状态、旧数据形状而建议保留错误模型，除非你明确说明这是产品必须承担的迁移成本。
- Stage Interface 是 agent-facing 外部接口边界。Domain modules 不应依赖 Stage Interface 的 DTO、presentation helper 或 tool-definition shape。
- 普通 domain module 应依赖窄 capability port，而不是拿 full aggregate store。
- 带副作用的方法，例如 ground、getOrCreate、put、upsert、merge、attach、promote、record、delete，不应藏在 vague read/query/support port 后面。

请输出一份完整详尽的中文报告，建议结构如下：

# MineMusic MVP -> Formal Project Architecture Audit

## 1. Executive Summary
总结最重要结论：
- 哪些东西值得保留；
- 哪些东西必须重构；
- 最大的架构风险；
- 最优先的几个迁移动作；
- 是否建议渐进迁移、局部重写、还是大模块重建。

## 2. Evidence Inventory
列出你实际阅读过的文件、目录、测试、命令或搜索结果。
说明哪些结论来自代码，哪些来自文档，哪些只是推断。

## 3. Current Architecture Map
画出当前系统实际架构，而不是文档声称的架构。
至少覆盖：
- Stage Interface
- Stage Core
- material query / search / resolve
- library import / update
- source provider
- canonical / collection / material store
- recommendation / presentation
- database / storage layer
- handbook / generated agent-facing output

可以使用 Mermaid 图。

## 4. Domain Language And Naming Audit
建立当前核心对象词表，包括但不限于：
- material
- materialRef
- MusicMaterial
- MaterialCard
- source
- sourceRef
- canonical
- sourceEntity
- canonicalRecord
- collection
- sourceLibrary
- provider
- query
- search
- resolve
- materialization
- import / update
- playable link / provider url

对每个对象说明：
- 当前含义；
- 出现在哪些文件/接口；
- 是否有混名、重名、误名；
- 它应该保留、改名、合并、拆分还是删除；
- 正式项目建议使用的 canonical name；
- 迁移影响。

## 5. What To Keep And Migrate
用表格列出值得保留的设计/代码：

字段：
- Component / File
- Good Design Or Code Worth Preserving
- Why It Is Valuable
- Evidence
- Migration Condition
- Required Cleanup Before Formalization
- Tests Or Guards Needed

不要只说“这个不错”。必须说明它在正式项目里解决什么问题，以及不清理哪些部分就不能迁移。

## 6. What Must Be Refactored Or Removed
用表格列出必须重构的对象、模块、管线或接口：

字段：
- Severity
- Module / File / Concept
- Symptom
- Root Architectural Problem
- Evidence
- User Or Developer Impact
- Target Shape
- Minimal Migration Slice
- Tests / Architecture Guards
- Risk If Deferred

重点检查：
- 核心对象命名不一致；
- read/write capabilities 混乱；
- 数据操作管线纠缠；
- 查询路径手拼 pipeline；
- 数据库操作入口分散；
- domain module 是否依赖 Stage Interface / presentation / runtime assembly；
- query path 是否偷偷 materialize / mutate；
- writer capability 是否藏在 read/query/support port 后面；
- public output 是否泄露内部存储/provider/canonical 细节；
- tests 是否只测行为，不守边界。

## 7. Target Formal Architecture
提出正式项目目标架构。至少包括：

- bounded contexts；
- 每个 context 的 owner responsibility；
- allowed reads；
- allowed writes；
- public ports；
- forbidden imports；
- database/repository access pattern；
- query/search/resolve/import/update/recommendation 的目标管线；
- Stage Interface 输出边界；
- domain object canonical naming；
- 数据库入口和 transaction boundary。

请给出 Mermaid 图和一张 context/port 表。

## 8. Data Access And Query Architecture
重点分析数据库与查询层：

- 当前数据库操作分布在哪里；
- 哪些模块在绕开统一入口；
- 哪些 query 在自己拼管线；
- 哪些读路径混入写路径；
- 哪些查询应该下沉到数据库能力；
- 哪些索引、FTS、repository、projection、read model 值得保留或重建；
- 正式项目里 database gateway / repository / query service / materializer 应如何分层。

输出目标形态和迁移步骤。

## 9. Pipeline Audit
分别审计以下流程：

- source library import
- source library update
- material search
- material query
- material resolve
- canonical maintenance
- collection action
- recommendation present
- feedback / correction if present
- handbook generation / agent-facing output

每条 pipeline 说明：
- 当前输入；
- 当前输出；
- 当前读写点；
- 当前跨 context 依赖；
- 当前问题；
- 正式项目目标流程；
- 可以复用的代码；
- 必须重写的代码；
- 最小 PR 切片。

## 10. Testing And Architecture Guards
检查当前测试是否足够防止架构回退。

请提出：
- behavior tests；
- contract tests；
- architecture/import-boundary tests；
- port key-set assertions；
- public-output leak tests；
- query/read/write separation tests；
- database/repository tests；
- regression tests for migration.

每个测试建议必须绑定到具体风险。

## 11. Migration Roadmap
给出务实的迁移路线，不要只给大重写口号。

每个 phase 包含：
- goal；
- non-goals；
- files likely to change；
- allowed reads；
- allowed writes；
- migration steps；
- tests；
- acceptance criteria；
- rollback risk；
- whether this should be one PR or multiple PRs。

## 12. PR Slice Plan
给出可以直接执行的 PR 切片列表。
每个 PR 必须小到可 review，并且有明确验收标准。

字段：
- PR title
- Goal
- Non-goals
- Owned bounded context
- Expected files
- Architecture guard
- Behavior tests
- Docs update
- Acceptance criteria
- Dependencies

## 13. Decision Log / ADRs Needed
列出正式项目开始前需要写成 ADR 或 architecture docs 的决定，例如：
- canonical object vocabulary；
- Stage Interface boundary；
- database access ownership；
- material search vs query vs resolve；
- materialization ownership；
- source/canonical/collection separation；
- public output compactness；
- MVP data compatibility policy。

## 14. Top Risks And Open Questions
列出仍需人工决定的问题。
不要把可以从代码中判断的问题推给用户。
只列真正需要产品/架构 owner 决策的问题。

## 15. Final Recommendation
给出你作为架构负责人会怎么做：
- 先保留什么；
- 先删除/重构什么；
- 第一周怎么做；
- 第一个月怎么做；
- 哪些事现在不要做。

输出风格要求：

- 中文；
- 具体、直接、可执行；
- 不要空泛赞美；
- 不要工程报告腔；
- 每个关键结论都要落到文件、代码路径、测试或文档证据；
- 如果证据不足，明确写“证据不足，需要进一步检查 X”；
- 不要为了礼貌弱化严重问题；
- 一个可下载的 markdown 文档。

**MineMusic 是一个**可扩展**的音乐 agent 脚手架和工作台（harness），让通用 LLM 能变成用户的私人音乐生活助理伙伴。**
