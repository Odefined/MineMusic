# MineMusic 代码审计报告

> **日期**:2026-06-23
> **范围**:全代码库架构审查 · **深度**:Standard · **维度**:全部六维
> **基准**:`docs/agent-native-workbench-adrs-phase-specs` @ `1cc288cb`
> **规模**:748 文件 / ~125.6k LOC / 81 测试文件
> **方法**:6 维并行子审计 + 关键 🔴 发现逐条 Read 复核 + 落盘前对抗式验证(详见末尾"验证迹")

---

## 执行摘要

**整体健康度:B+(约 78/100)——地基异常扎实,风险高度集中在两个地方:信任边界加固,与 agent-native 迁移的治理。**

这是一个**纪律罕见的代码库**。它不是"看起来有边界",而是用 `test/formal/active-tree.test.ts`(1218 行机器检查守卫)真正强制了导入方向、写边界、pg-boss 隔离、kernel 叶子性、面纱拒绝列表漂移。类型安全近乎无侵蚀:**0 个 `@ts-ignore`/`@ts-expect-error`、全库仅 2 处 `!` 非空断言**。44 个测试中 **31 个跑真 Postgres**。`npm audit` **0 漏洞**。src/ 里债务标记几乎为零(2 个 TODO,0 个 FIXME/HACK)。跨区扇入集中在 `contracts`(69)/`storage`(51)上,完全符合预期。

**安全态势经对抗式复核后确认较强**:当前**不存在 agent 可直接利用的洞**——download/localize 能力尚未经任何工具暴露,QQ 路径注入的 sink 真实但不可达,属于防御纵深缺口而非"今日可利用"。问题不在系统性腐烂,而在:

| 维度 | 🔴 | 🟡 | 🔵 | 信号 |
|---|---|---|---|---|
| 架构与边界 | 0 | 1 | 4 | 守卫严密,但 4 个区域仅文档 |
| 代码质量 | 1 | 5 | 3 | god object + 错误映射器复制 |
| 安全 | 0 | 4 | 3 | 防御纵深缺口 + stdio DoS + 硬编码凭据 |
| 性能 | 2 | 6 | 2 | 多处 N+1 / 逐行 INSERT |
| 测试 | 3 | 4 | 3 | 无 CI / 无 E2E 写入链路 / pg-boss 全 mock |
| 可维护性 | 2 | 4 | 3 | ADR 含已证伪前提 + pi 幽灵依赖 |
| **合计** | **8** | **24** | **18** | |

**Top 3 优先级**:
1. **加 CI** —— 守卫套件是项目命脉,却只在本地跑([测试 #1](#-测试))
2. **关闭 stdio DoS 闸 + isRefComponentSafe 路径元字符缺口** —— 信任边界还差最后几道闸([安全 #1/#2](#-安全));属防御纵深,但应在 download/localize 能力接线前补上
3. **治理 agent-native 层** —— ADR 0030-0039 含已验证为假的前提 + pi 依赖是幽灵依赖([可维护性 #1/#2](#-可维护性与技术债))

---

## 🏛️ 架构与边界

#### 🟡 1. ADR 0030-0039 的 4 个区域(Agent Runtime / Workbench Interface / Memory / pi 引擎)在 `src/` 零实现,但状态为 `Accepted`
`ARCHITECTURE.md` 第 56-62 行把这 4 个区域列为"正式顶层区域",与活动代码树的 9 个区域不符。ADR-0039 称"PR-A1a 已 pin pi-agent-core",但该依赖根本不在 package.json(见 [可维护性 #2](#-可维护性与技术债))。`Accepted` 混淆了"已决定"与"已构建"。
- **证据**:`find src -type d` 无 `agent_runtime/`、`workbench/`、`memory/`;`rg "AgentRuntime|RadioAgent|pi-agent-core" src/` 零命中
- **建议**:在 ADR 0030-0039 + ARCHITECTURE.md 加显式 `Implementation: not yet started` 字段;在 `active-tree.test.ts` 加存在性存根(类似 96-98 行)
- **工作量**:S

#### 🔵 2. 守卫未覆盖 `effect_boundary → contracts/stage_interface` 的类型-only 约束
`src/effect_boundary/stage_tool_execution_gate.ts:6` 导入 `../contracts/stage_interface` 是合法的(类型导入),但 `active-tree.test.ts:508-516` 的禁止扫描只挡 `../stage_interface/`,漏掉 `../contracts/stage_interface`。
- **建议**:在 Effect Boundary 扫描加正向断言:只允许 `import type` from `contracts/stage_interface`。工作量 S

#### 🔵 3. `stage_core → extension` barrel 消费无 port key-set 守卫
`src/stage_core/extension_runtime_module.ts:5` 直接吃 `extension/index.js` 公共 barrel,虽被组合根规则允许,但无守卫验证它只消费公共符号、不深入实现。
- **建议**:镜像 571-583 行 MI/ME allow-list,给 stage_core 的 extension 消费加符号集断言。工作量 S

#### 🔵 4. 读取侧 `createCollectionRecords` 未纳入 factory allow-list
`src/music_data_platform/collection_service.ts:5,212` 经 `runSourceOfTruthWrite` 路由写入(合规),但 `active-tree.test.ts:867-877` 的 factory allow-list 只枚举了 `createIdentityRepositories`/`createSourceLibraryRepositories`,遗漏它 —— 目前是"隐式允许"。
- **建议**:显式加入读侧 allow-list 或文档标记为批准的读门面。工作量 S

#### 🔵 5. 面纱泄露守卫只测锚点字符串格式
`test/formal/mcp-stdio-transport.test.ts:154-168` 只注入字面 `material:recording:m_internal`,未覆盖 CLAUDE.md "Agent-Facing Output" 禁止的更广类别(原始 provider payload、canonical 内部、调试字段)。
- **建议**:首批 Music Discovery 工具落地时,加 per-tool 输出 schema 边界断言。工作量 M

> **✅ 已验证合规**(非发现):pg-boss 严格隔离于 `background_work/`;所有非 adapter 领域零 stage_interface 实现导入;所有 `.run/.insert/.upsert/.delete` 落在 `directWriteAllowedFiles` 内;`kernel.ts` 真·叶子(0 contracts 导入);无 barrel `index.ts`。**边界规范真实、机器检查、执行严密。**

---

## 🧹 代码质量

整体质量高,问题集中在**复杂度热点**和**跨文件 DRY**,无系统性坏味道。

#### 🔴 1. `metadata_lookup_search_workspace.ts`(1454 行)是部分 God Object
单文件混了 5 重职责:事务编排、描述符构建、候选去重、**内联 SQL 字符串拼接**(`localMetadataWindowSql`/`metadataScoreSql`/`metadataVectorSql`)、游标分页。`:193-302` 的 factory 直接 `database.transaction(...)` 内联一切。
- **建议**:抽出 `SearchDescriptorBuilder`(纯映射)+ `MetadataLookupSql`(SQL 片段模块),workspace 只留事务编排。工作量 M

#### 🟡 2. `public*Error` 映射器复制 —— 比初判更窄(2/3 真复制,1 个是不同模型)
经对抗式复核修正:三个映射器**并非**如初判那般"完全同构"。
- `collection_edit.ts:573` `publicCollectionError`:唯一完全符合 `(error:unknown) → isMusicDataPlatformError 守卫 → switch(error.code) → stageEditFail` 结构。
- `relation_edit.ts:342` `publicRelationError`:守卫在调用点(:335-338)非函数内,但同为 `switch(error.code) → stageEditFail`,与 collection **真复制**。
- `import_control.ts:301` `publicImportError`:**不同模型** —— 入参是 `StageError`(非 unknown)、无 isMusicDataPlatformError 守卫、switch 的是 `firstFailureCategory(codes)`(category-axis)**非** `error.code`、调 `fail` 非 `stageEditFail`。强制并入共享表会 reconcile 两套不兼容的错误分类法。
- **真复制面**:relation↔collection 的 `stageEditFail` 映射 + 一句 `owner_scope_unsupported` 文案("Retry from the supported local owner scope.")在三处全现(relation_edit.ts:375、collection_edit.ts:612、import_control.ts:336)。
- **建议**:为 relation_edit+collection_edit 提取共享 code→stageEditFail 表驱动映射器;import_control 的 category 模型独立;去重那一句共享文案。工作量 M

#### 🟡 3. `placeholdersFor` / `uniqueRefKeys` 三份重复实现
`identity_records.ts:436` 与 `retrieval_result_set_records.ts:316` 各自定义 `placeholdersFor`,而 `retrieval_shared.ts:78` 已有 `sqlPlaceholders` 做同一件事。
- **建议**:删两份本地版,统一用 `sqlPlaceholders`。工作量 S

#### 🟡 4. `planProjectionInvalidationTargets` 巨型 switch(8 分支,97 行)
`projection_maintenance_commands.ts:557-653` —— cyclomatic 复杂度最高点,`source_material_binding_written` 分支嵌 3 层条件。
- **建议**:按 write-kind 分派到独立 `planInvalidationForXxx`(registry 模式),主函数仅 dispatch。工作量 M

#### 🟡 5. `discovery_lookup.ts` 双 6-分支 scope 解析 switch(984 行)
`discovery_lookup.ts:518-594` + `:674-708` + 8-case 错误码 switch `:792-809`,scope 解析分散多处。
- **建议**:抽 `LookupScopeResolver`(每 kind 一 handler)+ 表驱动错误映射。工作量 M

#### 🟡 6. identity 聚合热路径函数多职责
`identity_write_model.ts:316-401` `bindSourceToMaterial`、`:472-566` `mergeMaterialRecord` 混合拉取/判断/解绑/迁移/更新,回归风险集中。
- **建议**:拆 `resolveExistingBinding`/`rebindSource`/`moveBindingsToWinner`。工作量 M

#### 🟡 7. provider 插件臃肿未分层
`ncm.ts`(1776 行)、`qq.ts`(1231 行):factory 内嵌搜索逻辑、请求/URL/fetch/错误处理/解析/映射各层未分。
- **建议**:每 provider 拆 `Config`/`HttpClient`/`ResponseParser` 三模块,插件仅组合。工作量 L

#### 🔵 8. `source_library_import.ts`(894 行)批处理循环与错误分类耦合 — `classifyCandidateWriteFailure` `:772` + `:189-236`。建议错误分类表化。工作量 S
#### 🔵 9. `qq_qrc_decrypt.ts`(420 行)属必要复杂度,可接受;若非 QQ 专用可移到独立 `crypto/`。工作量 S(可选)

> **✅ 已验证良好**:无 `@ts-ignore`/`@ts-expect-error`,仅 2 处 `!`;所有 `return []` 经核为产品语义(空输入/无数据),无系统失败被静默吞;`stage_interface/index.ts:454` 的 `catch(()=>{})` 是带边界注释的合法 unhandled-rejection 防护;`ref_key`(DB) vs `refKey`(TS) 是正确的持久层边界约定。

---

## 🔒 安全

信任模型:agent/工具输入视为不可信。`npm audit`:**0 漏洞**。pi-agent-core 已 pin(ADR-0039)、pg-boss v12.20。

> **重要修正(对抗式复核)**:初判把 QQ 路径注入列为 🔴"唯一直接可利用"。复核确认 **sink 真实但当前不可达** —— 无任何 agent-facing download/localize/lyric 工具暴露,Host 端口无生产调用方,`sourceRef.id` 总是 provider 产出。故本维度无 🔴,全部为防御纵深 + 加固。安全态势实际较强。

#### 🟡 1. QQ provider 路径注入 —— isRefComponentSafe 不挡路径元字符(**防御纵深缺口,当前无 agent 可达路径**)
`qq.ts:696` `requestQqPath(config, \`/song/${mid}/url\`, {})` 与 `:855` `/song/${sourceRef.id}/lyric` 将 `mid`(来自 `sourceRef.id`)**原样插值进本地 ncmapi 代理 URL 路径**。唯一校验 `isRefComponentSafe`(`kernel.ts:43-54`)**只挡 `:` 和首尾空白,不挡 `/`、`.`、`..`**;`new URL(path, baseUrl)`(`qq.ts:574-576`)会规范化 `..`,理论上允许重定向 `http://127.0.0.1:8080` 上任意路径。NCM 安全(用 `searchParams.set`,已编码);QQ 查询参数用法(`:751`、`:831`)也**非** sink —— 经 `searchParams.set`(:526-528)百分号编码。**唯二真实 sink 是 `:696`、`:855` 两处路径插值。**
- **可达性(已溯源)**:目前**无 agent 可达路径**。无 agent-facing download/localize/playable/lyric 工具;`download()`/`localizeProviderSource()` Host 端口无生产调用方(仅测试);唯一消费 QQ `getDownloadSource` 的是 background localize job,而该 job 当前未被任何已接线工具/命令入队;存储的 `sourceRef.id` 总是 `toNonEmptyString(song.mid)`(provider 产出)。唯一现实注入向量是**恶意/被攻陷的 QQ bridge**,非 agent。
- **定级**:防御纵深 / 缺失安全网,**非**"今日可被 agent 利用"。但该缺口**应在 download/localize 能力接线前关闭**。
- **建议**:插值前白名单(QQ mid 为 `[A-Za-z0-9]{14}`)或 `encodeURIComponent(mid)`;扩展 `isRefComponentSafe` 拒绝路径元字符,或加专用 `isProviderIdSafe`;加回归测试钉死转义不变式。工作量 S

#### 🟡 2. stdio MCP 传输无消息大小上限(DoS)—— 与性能维 #7 收敛
`mcp_stdio_driver.ts:131` `handleLine` → `parseJsonRpcLine` 无字节检查;`mcp_stdio_entrypoint.ts:89` 的 `createInterface` 无 `maxLineLength`。快速大帧攻击耗尽内存/CPU。
- **建议**:驱动加 `MAX_MESSAGE_BYTES`(如 256KB),`Buffer.byteLength(line)` 超限回 `JSON_RPC_PARSE_ERROR`。工作量 M

#### 🟡 3. 配置默认值含硬编码 DB 凭据
`config.ts:35` 回退 `"postgres://postgres:postgres@127.0.0.1:5432/minemusic"`。未设 `MINEMUSIC_DATABASE_URL` 时以弱口令静默启动,且串进日志。
- **建议**:未设环境变量时 fail-fast 报明确错误,不回退弱默认。工作量 S

#### 🟡 4. 底层 `cause.message` 渗入持久化/边界消息(信息泄漏)
`download_commands.ts:249` 把 `cause.message` 持久化进下载作业记录(可能经摘要暴露给 agent);`handle_registry_records.ts:180`、`lookup_cursor_registry_records.ts:138` 把解析错误消息嵌入。分发层(dispatch `:209-217`)能把 handler 抛出映射为通用 `tool_handler_failed`,但作业状态行绕过结构化错误路径。
- **建议**:信任边界对外消息沙盒化 `cause.message` —— 完整原始错误只记日志,对外渲染固定文案;验证下载作业状态消息不经面纱不达 agent。工作量 M

#### 🔵 5. FTS/相似度 SQL 已参数化,但转义是唯一安全网
`material_text_normalization.ts:145` `quotedMaterialTextToken` 单引号加倍是 `to_tsquery('simple', ?)` 唯一防注入点。当前安全,但重构易破。
- **建议**:加单元测试钉死(注入串 `'); DROP TABLE--` 必须留作字面 token),文档标注该函数为关键安全控制。工作量 S

#### 🔵 6. 检索 owner_scope 硬编码单一全局域(多租户未来风险)
`query_normalization.ts:114-124` 拒绝非默认域(当前防跨租户,好),但意味着多租户落地时所有假设全局域的查询都是潜在泄漏点。
- **建议**:多租户启用时审计所有 28 个 `owner_scope` 读路径,加属性测试断言每域只返回本域行。工作量 M(未来)

#### 🔵 7. `inFlight` 注册表 + 无并发上限 = DoS 放大器(与性能 #7 同源)—— 详见性能维。工作量 M

> **✅ 已验证安全**(非发现):所有观察到的 SQL 用参数化 `?` 绑定(`placeholdersFor` 仅生成 `?`、Postgres 层 `client.query(sql, params)`);句柄/游标解析用 `getByOwnerPublicId`/`getByOwnerCursor` 做 owner 过滤,伪造 id 无法跨租户;provider 凭据不嵌入代码、不进 agent 输出;下载 URL 源自 provider 解析(非 agent 直供)。

---

## ⚡ 性能

#### 🔴 1. 库导入对每个候选开独立事务 + 每候选两次批量重读(已对抗式确认)
`source_library_import.ts:219-239` 候选循环:`:220` `requireBatch`(写前读)、`:228` `processCandidate`(独立写事务)、`:238` `requireBatch`(写后读)。`processCandidate`(:254-299)经 `runSourceOfTruthWrite`(:259),后者在 `source_of_truth_write_commands.ts:255` 每次开新 `database.transaction` —— **每候选 1 事务 + 1 提交,N 候选 = N 提交**。双批量读确认冗余:唯一改批量行的写是 `recordImportItem → incrementBatchCounts`,`batch` 在 N-1 轮 `:238` 已是写后态,故 N 轮 `:220` 读观察同一状态,**前置读真冗余**(后置读为下一轮 max_new_items 门刷新计数)。
- **证据(逐行)**:`219 for(...) / 220 requireBatch(读1) / 228 processCandidate(事务) / 238 requireBatch(读2)`;`source_of_truth_write_commands.ts:255 database.transaction(...)`。
- **规模**:2 批量读 × 100 ≈ 200 批量行往返 + 100 提交。估计公平且精确。
- **建议**:整页候选单事务批处理;从写结果算 `importedCount` 免重读;或用多行 `INSERT`。至少删冗余前置 `requireBatch`。工作量 M

#### 🔴 2. `insertSearchResultRows` 逐描述符一次 INSERT(已确认,且比初判更严重)
`metadata_lookup_search_workspace.ts:738-776` 每个描述符一次参数化 `INSERT`,在 `for...of` 内 `await`,非多行 `VALUES`,且在用户搜索事务内(`:209` transaction、`:272` 调用)。
- **修正的规模**:`LOCAL_RESULT_WINDOW_MULTIPLIER = 10`(`:191`),故 `limit=50` → `localResultWindowLimit = 500`(`:203`,非 50);描述符按 `descriptorKey` 去重(`:244-249`)。去重后描述符数 = 至多 500 本地行 ∪ provider 候选。**`limit=50` 满目录时可超 150,`limit=100` 可逼近 1000+** —— 比"70-150"更严重。
- **建议**:多行 `VALUES` 构造或 `UNNEST` 数组参数。描述符已在内存。工作量 S

#### 🟡 3. provider 候选解析短路链(已修正:表名/短路/JOIN 难度)
`metadata_lookup_search_workspace.ts` 的 `addProviderCandidateDescriptor`(:384-475)对**每个已解析候选**最多 3 次顺序 `await`:`:402` `providerResolvedMaterialIdentity`、`:409` `providerResolvedMaterialBlocked`、`:413` `providerResolvedMaterialDescriptor`。**修正初判三处**:
- **表名**:identity 查 `source_material_bindings JOIN material_records`(:487-504,**非** 单 `material_records`);descriptor 查 `search_metadata_documents`(:506-539);blocked 查 **`owner_material_relations`**(:541-558,**非** `owner_material_entries` —— 后者是 catalog-entry 表,完全不同的关系)。
- **是短路链非 3 独立查**:identity 未定义 → 落候选插入路径(:404);material_kind 不匹配请求过滤器 → `return`(:405-407);blocked → `return`(:409-411);**descriptor 仅在 resolved 且未 blocked 时才取**(:413)。故常见路径常只 **1 查**(provider 候选本就是为浮现未解析材料),最坏 3 查。无跨候选批处理。
- **"单 JOIN"非平凡**:blocked 是存在性谓词(非行取),descriptor 数据依赖 blocked 结果;可 `LEFT JOIN owner_material_relations + LEFT JOIN search_metadata_documents` 但非 1:1 折叠。
- **定级**:🔴→🟡。模式真实(每已解析候选顺序 await、无批处理、最坏 3 往返),但常见成本被短路压低。
- **建议**:跨候选批处理已解析集;或 LEFT JOIN 折叠最坏 3 查为 1。工作量 M

#### 🟡 4. 过期结果集/候选缓存清理跑在每次搜索事务内
`metadata_lookup_search_workspace.ts:222-223` 每次冷搜索返回首行前 `await` 两套清理 DELETE。有 `LIMIT 500` 兜底但串在关键路径,且并发搜索互相竞争同一过期集合。
- **建议**:挪到 pg-boss 维护作业(已有投影维护 runner 可复用),或事务外异步触发。工作量 S

#### 🟡 5. 内存审计端口无限增长,每次工具调用写一条
`stage_tool_execution_gate.ts:52-67`,装配于 `stage_tool_context_assembly.ts:70`。`createMemoryStageToolAuditPort` 进程级单例,`record()` 无界 `push`,长寿命 stdio host 下单调累积 → 内存压力 + 线性 GC 成本。
- **建议**:有界环形缓冲(限 N 条丢最旧)或定期刷持久层。工作量 S

#### 🟡 6. `boundSourceRecordsForMaterial` 真实 N+1(已确认,**修复更易:批量原语已存在**)
`material_text_projection_commands.ts:252-275`:取绑定列表(1 查 `listSourcesForMaterial`)后逐 binding 一查 `sourceRecords.get`(K+1 往返)。**同函数体逐字重复**于 `search_metadata_projection_commands.ts:201-226`。两者都在 per-material 重建循环内调用,聚合 = ΣK-per-material + 1-list-per-material。
- **关键修正**:批量原语 `listByRefs`(`identity_records.ts:154-168`,`WHERE ref_key IN (${placeholdersFor(refKeys)})`)**已存在** —— 这是**漏用**而非缺原语,改起来近乎一行。
- **建议**:两处把逐 binding `get` 循环换为 `sourceRecords.listByRefs(refKeys)`。工作量 S

#### 🟡 7. MCP stdio 驱动无并发/背压上限 —— 与安全 #2/#7 收敛
`mcp_stdio_driver.ts:186-232`:`tools/call` fire-and-forget(`:190` `void handleToolCall`),突发 1000 调用 = 1000 并发分发(各自开事务 + provider 调用)。`inFlight` 无界增长。
- **建议**:有界并发 runner(p-limit 风格信号量)包裹 dispatch,超限入队等待。文档说明串行读循环 vs 无限并发的权衡。工作量 S

#### 🟡 8. pg-boss 后端无默认 `teamSize`/`new` 上限,依赖调用方
`pg_boss_backend.ts:132-156` 只设 `batchSize:1`,`teamSize`/`new` 由 `workOptions` 透传,根组合若无默认则高积压可能并发事务失控。
- **建议**:组合根设显式 `teamSize`(单队列 2-4),确认库导入与投影维护队列隔离不互饿。工作量 S

#### 🔵 9. lookup_cursor 注册表过期行从不主动清除 —— `lookup_cursor_registry_schema.ts:14-25` 仅惰性检查,无 `expires_at` 索引、无驱逐作业 → 表/索引膨胀。建议加索引 + 复用维护 runner 的驱逐。工作量 S
#### 🔵 10. 作用域可用性每次访问深拷贝 —— `scope_availability.ts:102-121` 每次 `listAvailableMusicScopes` 深拷整快照,O(scopes) 分配在热路径。建议返回冻结视图。工作量 S

> **✅ 已验证良好**:投影重建(所有者目录/集合/关系)是集合化 SQL(单 `DELETE WHERE` + 单 `INSERT...SELECT...GROUP BY`),不违反 CLAUDE.md;FTS 重排是单往返 SQL 非 TS 端排序;游标分页走索引化 `ORDER BY`;provider 搜索 `Promise.all` 并行;provider 响应缓存于 Postgres(30min TTL + 批量驱逐)。

---

## 🧪 测试

**运行机制(关键事实)**:44 个测试模块在 `test/formal/`,经**手写 runner** `test/run-stage-core-tests.ts`(硬编码 44 路径扁平列表)加载,断言用 `node:assert/strict`。**44 个里 31 个跑真 Postgres**(基于 PID 的 schema 隔离)。`test/live/` 有 10 个 provider 烟测(真网络,按需 `smoke:*`)。

| 领域 | 覆盖 | | 领域 | 覆盖 |
|---|---|---|---|---|
| music_data_platform(77 文件) | 强 | | storage/Postgres | 强 |
| extension/插件(NCM/QQ) | 强 | | music_intelligence/experience | 中 |
| stage_interface(框架) | 中 | | server(组合根) | 中 |
| background_work(pg-boss) | **弱** | | effect_boundary(门控) | 弱-中 |

#### 🔴 1. 无 CI —— 测试只在本地、只在 `npm test` 时跑
无 `.github/workflows/`、无任何 CI 配置。**守卫套件(项目命脉)、Postgres 测试、typecheck 可能在未跑它们的工作中静默回归**;runner 的 44 路径列表也需手动同步。
- **建议**:加 GitHub Actions 跑 `npm test` + `127.0.0.1:55432` Postgres service,守卫失败即阻塞。工作量 M

#### 🔴 2. 无端到端工具调用测试 —— 路由→门控→handler→命令→Postgres 写→投影→响应从未串成一条
`stage-interface-tool-frame.test.ts` 用 mock 工具测框架;`server-entrypoint.test.ts` 只调只读 `stage.runtime.status`;`server-host.test.ts` 跑读路径但未断言写后投影。**这正是"跨 PR 盲点"类型的 seam 漏洞**:门控装配回归、工具后投影未触发、ownerScope 在 HTTP→上下文间丢失都不会被抓。
- **建议**:孵化 MCP 服务器 E2E,发真实 `tools/call` 写(如 `library.collection.create`),对真 Postgres `SELECT` 断言行,再用第二个 ownerScope 断言租户隔离。工作量 L

#### 🔴 3. owner_scope 多租户隔离在传输/装配边界未测
`mcp_stdio_driver.ts:203-210` 硬编码 `ownerScope:"local"`,所有传输/装配测试同。无测试断言 `user-a` 禁止读写 `user-b` 数据。
- **建议**:跨 owner 测试:为 user-a 写,以 user-b 读/改同资源,断言拒绝/空。工作量 M

#### 🟡 4. pg-boss 后端全 mock —— `background-work-backend.test.ts` 用内联 `FakePgBossClient`,从未起真 pg-boss、不触真队列/DB。pg-boss v12 API 面(`onComplete` 存废、作业状态转换、重试语义)未测。**这正是 mock/真数据分歧隐藏错误处**(pg-boss v12 `onComplete` 历史误判)。
- **建议**:用临时 Postgres 跑真 pg-boss,覆盖 send→work→complete 生命周期 + `localize_provider_source` 作业。工作量 M

#### 🟡 5. MCP 传输:超大/畸形 JSON-RPC 未测 —— 无大小限制、无 `__proto__`/嵌套负载测试。建议加框架测试拒绝超限行 + 原型污染键。工作量 S
#### 🟡 6. 并发/分块/部分读取在 stdio 传输未测 —— `inFlight` 按 `JSON.stringify(id)` 键控,无数值/字符串 id 冲突测试,readline 正确性是假设非断言。工作量 M
#### 🟡 7. `Result<T>` 失败通道覆盖不均 —— 扩展槽测试错误分支好(62 `ok:false` vs 65 `ok:true`),但 MDP 大文件主要断言成功路径(`source-library.test.ts` 1588 行仅 7 个顶级测试)。建议加 grep 检查:每公共命令至少一测试覆盖其声明错误码。工作量 M
#### 🟡 8. 缺边缘场景:空输入/大输入/并发/时间边界 —— 全正式测试"并发"命中 0。建议加导入批上限、检索游标边界、投影维护过期边界测试。工作量 M

#### 🔵 9. 手写 runner 脆弱需手动同步 —— 新测试不加进 44 列表则**静默不运行**,作者得虚假通过。建议 glob 自动发现 + 加"目录里每个 .test.ts 都在列表中"的元测试。工作量 S
#### 🔵 10. 共享 fixture/辅助重复散落 —— `test/formal/helpers/` 仅 2 文件,大量内联构建器(`testStageToolContext()`/`batchRecord()`/`candidateFor()`)跨文件重复。建议提取到 `test/support/fixtures/`。工作量 S
#### 🔵 11. `formal-contracts.test.ts:57` 用 `doesNotThrow` 而非断言实际行为("未抛异常"反模式)。工作量 S

> **✅ 测试强项**:守卫套件真实可跑且全面(50+ 禁止导入模式、35 个写入边界文件、投影失效作用域、低层写工厂限制);Postgres 测试内省真实索引(`indexCovers`/`uniqueIndexCovers`);QQ QRC 解密对 Python 参考向量测试;无快照测试,仅真外部边界(fetch、pg-boss)mock。

---

## 🔧 可维护性与技术债

**债务清单**:src/ 几乎无债(2 TODO / 0 FIXME-HACK,`tsc --noEmit` 通过,`strict`+`exactOptionalPropertyTypes` 开启)。**债务几乎全在文档-代码漂移、文档臃肿、未跟踪的后续工作。**

#### 🔴 1. ADR 0030-0039 含**已验证为假**的工程前提,仍标 `Accepted`
memory `pi-agent-core-compaction-persistence-audit`:"phase-A ledger-row-6 '(compaction is native)' 为假"(低层 Agent 无 compaction/persistence/endurance)。memory `pi-agent-core-no-subagent-primitive`:读 .d.ts 证实 pi **无 subagent/fork/dispatch 原语**,故 ADR-0032"复用 pi 父子通道"前提不成立(协调层必须 MineMusic 自建)。两 ADR 仍 `Accepted`,实现 Phase A 的人若信 ADR 会撞这两个坑。架构不一致日志的 Open 区为空,未记录。
- **建议**:给 ADR-0032、ADR-0039 加 `Correction` 注;更新 phase-A spec ledger-row-6;记入 inconsistency-log。工作量 S

#### 🔴 2. `@earendil-works/pi-agent-core` + `pi-ai` 是幽灵依赖(已在 node_modules,package.json/package-lock.json 零声明,src/ 零 import)
`ls node_modules/@earendil-works/` → 两者都在;`rg "earendil|pi-agent-core|pi-ai" package.json package-lock.json` → 空;`rg ... src/` → 空。**干净克隆 `npm ci` 即删**。违反 ADR-0039 的 pin 保证 —— 当前 pin 不可执行。
- **建议**:Phase-A 未开始则移除 node_modules 条目;或加显式依赖 pin 并记录 PR-A1a 未合并。工作量 S

#### 🟡 3. Phase 22 后续(消亡的 `query_service`/`mixed_workspace`)、Phase 24 Slice 5、检索删除边界**无任何 GitHub issue 跟踪**
`gh issue list` 仅 11 个通用 `needs-triage` + 一个自由式 #78。主要迁移项只在 spec/CURRENT_STATE,无 issue 支撑。文档驱动追踪在重构中已被证明脆弱。
- **建议**:为每个 Phase-22/24 延期切片 + Phase A/B/C 里程碑开专门 issue,交叉链接 `docs/agents/issue-tracker.md`。工作量 S

#### 🟡 4. `retrieval_result_set_schema.ts` 文件名陈旧误导
文件头(3-9 行)自述旧表已删,内容只剩 `material_candidate_cache`。memory `retrieval-deletion-boundary-phase22` 标其应与 `query_service`/`mixed_workspace` 一起判"消亡"。
- **建议**:重命名为 `material_candidate_cache_schema.ts`(含导出),更新 memory/Phase-22 后续。工作量 S

#### 🟡 5. `src/music_data_platform` 是 77 文件/2 万行的巨石(占 src 51%),`stage_adapter/catalog.ts`(1318 行)混合工具描述符/handler/游标反序列化/显示投影
MDP 内子区域(identity/source_library/owner_catalog/material_text/search_metadata/metadata_lookup/stage_adapter)扁平无内部边界。Issue #92/#94 已点出。
- **建议**:按子上下文拆 MDP 目录;catalog.ts 显示投影抽到专门投影模块。工作量 L

#### 🟡 6. `docs/maintenance/` 有 8 个重叠审计/计划文档,无明确活动权威
`architecture-inconsistency-log.md`、`clean-up-report.md`、`dead-code-compatibility-cleanup-plan.md`、`defensive-fallback-audit-2026-06-17.md`、`documentation-alignment-audit.md`、`documentation-alignment-plan.md`、`documentation-architecture.md`、`minemusic_architecture_improvement_report.md`。inconsistency-log 的 Open 区为空。5 个是 6/2-6/3 旧件,只有防御性回退审计是新的(6/17)。`docs/product/` 又加了与 ADR-0030-0039 重叠的共识文档。
- **建议**:旧审计归档到 `docs/archive/maintenance-2026-06/`,只留 `documentation-architecture.md`(权威)+ 实时不一致日志;合并 product 共识文档进 ADR/phase-A-B-C spec。工作量 M

#### 🟡 7. 无模块→区域映射 —— INDEX.md 是扁平 90 行文档列表,ADR 区域名("Music Data Platform")不匹配 src 目录名(`music_data_platform`),无规范连接。3 个未实现区(Agent Runtime/Workbench/Memory)在新人搜索时找不到。
- **建议**:给 ARCHITECTURE.md 或 `docs/agents/domain.md` 加 区域→目录→契约文件→ADR 表,标未实现区。工作量 M

#### 🔵 8. tsconfig 有 `strict` 但**未开** `noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns` —— 死变量/未用参数可编译。建议开启三标志,成本低符合项目严格立场。工作量 S
#### 🔵 9. `pg`/`pg-boss` 用 `^` 范围允许 minor 自升级 —— 与 ADR-0039 的 pin 意图相悖(pg-boss v12 `onComplete` 被移除的历史误判)。建议 pin 精确补丁版 + lockfile-lint。工作量 S
#### 🔵 10. `storage.ts:35` 合法契约词 `"provisional"` + 两个 server 文件自述"shim"触发债务 grep 误报 —— 合法组合根适配器,可选改名 `*_adapter.ts`。工作量 S

> **✅ 做得好**:src/ 债务标记近零、typecheck 清洁、跨区导入耦合低(server 扇入 0,无领域模块反向导入 server/stage_interface)、每迁移阶段有 spec+plan+ADR 三件套配对、CURRENT_STATE.md 文件粒度精确。

---

## 优先级行动计划

### 🟢 立即快赢(< 1 天,S 工作量)
1. **关闭 QQ 路径元字符缺口** — `encodeURIComponent(mid)` + `isProviderIdSafe` 白名单 + 回归测试(防御纵深,接线前必修)([安全 #1](#-安全))
2. **DB 凭据 fail-fast** — 移除 `config.ts:35` 弱默认([安全 #3](#-安全))
3. **清理 pi 幽灵依赖** — 移除 node_modules 或正式 pin([可维护性 #2](#-可维护性与技术债))
4. **修正 ADR 假前提** — 给 ADR-0032/0039 加 `Correction` 注 + 更新 ledger-row-6([可维护性 #1](#-可维护性与技术债))
5. **`insertSearchResultRows` 改多行 INSERT**([性能 #2](#-性能))
6. **`boundSourceRecordsForMaterial` 换已存在的 `listByRefs`** —— 近乎一行,两处([性能 #6](#-性能))
7. **内存审计端口加环形缓冲上限**([性能 #5](#-性能))
8. **`placeholdersFor` 三份合一**([质量 #3](#-代码质量))
9. **重命名 `retrieval_result_set_schema.ts`**([可维护性 #4](#-可维护性与技术债))
10. **tsconfig 开 `noUnusedLocals`/`noUnusedParameters`/`noImplicitReturns`**([可维护性 #8](#-可维护性与技术债))

### 🟡 中期改进(1-5 天,M)
11. **加 CI**(GitHub Actions + Postgres service)—— 最高杠杆([测试 #1](#-测试))
12. **stdio 传输加消息大小上限 + 并发闸**([安全 #2](#-安全) + [性能 #7](#-性能))
13. **E2E 工具调用测试 + 跨 owner 隔离测试**([测试 #2/#3](#-测试))
14. **pg-boss 测试迁真 Postgres**([测试 #4](#-测试))
15. **库导入单事务批处理 + 删冗余重读**([性能 #1](#-性能))
16. **provider 候选解析跨候选批处理 / LEFT JOIN 折叠**([性能 #3](#-性能))
17. **提取 relation↔collection 共享 `stageEditFail` 映射器**([质量 #2](#-代码质量))
18. **拆 `metadata_lookup_search_workspace` god object**([质量 #1](#-代码质量))
19. **给 Phase-22/24/A-B-C 后续开 issue 跟踪**([可维护性 #3](#-可维护性与技术债))
20. **归档旧 maintenance 文档**([可维护性 #6](#-可维护性与技术债))

### 🔵 长期倡议(> 5 天,L)
21. **`src/music_data_platform` 按子上下文拆分**([可维护性 #5](#-可维护性与技术债),Issue #92/#94)
22. **provider 插件(ncm/qq)分层为 Config/HttpClient/Parser**([质量 #7](#-代码质量))
23. **多租户 owner_scope 全路径审计 + 属性测试**([安全 #6](#-安全),随 Phase A 落地)

---

## 指标

| 指标 | 值 |
|---|---|
| 分析文件 | 748(TS/JS,排除 node_modules) |
| 代码行 | ~125,599 |
| 测试文件 | 81(44 正式 + 10 烟测 + 辅助) |
| 真实 Postgres 测试 | 31/44(70%) |
| `npm audit` 漏洞 | **0** |
| `@ts-ignore`/`@ts-expect-error` | **0** |
| 非空断言 `!` | 2 |
| src/ 债务标记(TODO/FIXME/HACK) | 2 / 0 / 0 |
| `tsc --noEmit` | 通过 |
| 🔴 高严重发现 | **8**(对抗式验证后) |
| 🟡 中严重发现 | ~24 |
| 🔵 低严重发现 | ~18 |
| 已实现顶层区域 | 9 / 11(4 区仅文档:Agent Runtime/Workbench/Memory/pi 引擎) |

**一句话结论**:这是一个**工程纪律远超常态**的代码库 —— 边界守卫真实可执行、类型安全近乎无侵蚀、测试大量跑真库、安全态势经复核确认无 agent 可利用洞。真正的风险不在"代码烂",而在 **(a) 信任边界还差最后几道闸**(QQ 防御纵深缺口、stdio DoS、硬编码凭据)、**(b) agent-native 迁移治理失序**(含假前提的 ADR、幽灵依赖、无 CI 兜底)。优先把 #1-10 的快赢做掉,再上 CI 和 E2E,这个项目的地基就接近无懈可击。

---

## 验证迹(落盘前对抗式复核)

为避免把子审计的误判固化进耐久报告,落盘前对 6 个"我未亲自 Read、仅采信子审计"的高影响发现跑了对抗式验证 workflow(6 个怀疑论者并行读真实代码尝试反驳)。结果:

| 发现 | 裁决 | 处理 |
|---|---|---|
| PERF-1 库导入逐候选事务 | ✅ confirmed | 保持 🔴,逐行证据补强 |
| PERF-2 逐行 INSERT | ✅ confirmed(数字偏小) | 保持 🔴,**修正规模**:multiplier=10,limit=50→500 行,去重描述符可达 150-1000+ |
| PERF-3 provider 候选 3 查 | ⚠️ partially-correct | **降级 🔴→🟡**:修正表名(`owner_material_relations` 非 `owner_material_entries`)、补短路语义(常 1 查非 3)、注明 JOIN 非平凡 |
| PERF-6 boundSource N+1 | ✅ confirmed(修复更易) | 保持,补注 `listByRefs` 原语已存在,纯漏用 |
| QUALITY-2 错误映射器复制 | ⚠️ partially-correct | **降级 🔴→🟡**:修正只有 2/3 真复制,import_control 是 category-axis 不同模型 |
| SECURITY-1 QQ 注入可达性 | ⚠️ partially-correct | **降级 🔴→🟡**:修正当前无 agent 可达路径(能力未接线),定级为防御纵深缺口 |

**净影响**:🔴 计数 11→8;执行摘要 Top-3 与安全态势表述据此修正(初稿"唯一直接可利用洞"经证伪已删除)。验证 workflow run ID:`wf_7dd8ce76-63d`。
