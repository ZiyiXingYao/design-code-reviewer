# archify 产物契约（必需层）

本技能只评审 brainstorming-archify 的产物。契约不匹配时**停下来报错**，不许"尽力而为"地猜——猜错会让断言抽取错位，整份报告失效而不自知。

## 1 固定路径与编号

```
specs/design/00-接口契约.md          必需；`00-` 是固定字面前缀，不参与模块序号
specs/design/01-架构设计.md          必需；固定 01
specs/design/02-实体与数据设计.md     必需；固定 02
specs/design/03..NN-<模块>.md        必需，≥1 个；编号从 03 连续递增
specs/design/task.md                必需；实现任务清单
specs/design/diagrams/              建议；缺失记 P3
.brainstorming-archify/state.yaml    必需
.brainstorming-archify/change-lists/*.md  必需
```

**命名纪律**：`0-接口契约.md`、`接口契约.md`、`contract.md` 都是缺陷（P2）。
模块文档"只追加、不重编号"：新增模块接在最大编号之后；删除模块留下的空号必须在该文档或变更清单中说明。

## 2 state.yaml schema（schema_version = 1）

```yaml
# 本文件只允许由 scripts/task-state/change-state.mjs 编辑
schema_version: 1
state: "closed"            # explore | draft | confirm | closed
files:
  - path: "specs/design/00-接口契约.md"
    status: "confirmed"    # 每份文档的确认态
reopens:
  - at: "2026-10-13T01:26:12.184Z"
    reason: "…"
    files: ["specs/design/00-接口契约.md", "…"]
change_list:
  path: ".brainstorming-archify/change-lists/20261019T095928Z-<slug>.md"
  set_at: "…"
task_md: "specs/design/task.md"
log: []                    # 可选
```

**校验规则**：
- 缺 `schema_version` / `state` / `files` / `reopens` 任一项 → 无法判等级，**保守按 draft 处理**并告警。
- `change_list.path` 指向的文件必须存在，且是最后一次变更。
- `reopens[].files` 用于风险加权：同一文档 reopen ≥3 次 → 该文档逐节细查。

**状态门禁**：

| state | design 技能处置 |
|---|---|
| `closed` | 基准可用，结论可作 Gate D 依据 |
| `confirm` | 可对照，报告标「基准未冻结」，对照类结论仅参考 |
| `draft` / `explore` | 不拒绝，但结论标 `参考`，**不得用于 Gate D 放行**（设计还在改，照出的"不符"可能是设计本身要变） |

## 3 change-list 结构

路径形如 `.brainstorming-archify/change-lists/<UTC 时间戳>-<slug>.md`。必须含四段：

| 段 | 内容 | 用途 |
|---|---|---|
| `## 讨论记录` | 每轮讨论的起因与范围收敛 | 判断决策背景 |
| `## 关键决策` | 决策条目（D-nnn 或加粗条目）+ 理由 | A1 决策追溯的**意图源** |
| `## 文件修改台账` | 文件 / 变更性质 / 涉及章节 / 状态 | 判断哪些文档受影响 |
| `## 落盘授权` | 用户授权的范围与修正 | 判断改动是否越权 |

**决策编号**：若条目带 `D\d+` 编号则直接引用；若无编号（常见），按出现顺序编号为 `D-01..`，并在报告中注明"本轮无显式编号，按序编号"。

## 4 模板章节表

固定章节缺失且未写"不适用 + 理由"→ P2（工艺项）。

| 文档 | 必需章节（标题关键词） |
|---|---|
| `00-接口契约.md` | 总则；1 MySQL 数据表；2 Redis key 与结构；3 MQ 消息通道；4 HTTP 接口；5 gRPC 接口；6 动态库 API；7 TCP 接口；8 其他对外接口；9 跨类别共同约定；10 待定问题与风险 |
| `01-架构设计.md` | 1 背景与问题；2 目标与非目标；3 方案对比与选型；4 整体功能说明；5 功能点需求说明；6 功能模块划分；7 跨模块接口矩阵；8 核心类设计；9 代码文件树组织；10 全局功能流程；11 业务编排流程；12 运行视图；13 部署视图；14 关键决策记录；15 待定问题与风险 |
| `02-实体与数据设计.md` | 1 数据模式总览；2 领域类图；3 实体关系图；4 数据流图；5 核心实体状态机；6 数据生命周期与保留；7 关键决策记录；8 待定问题与风险 |
| `NN-模块.md` | 1 模块职责与边界；2 本模块类清单与关系；3 类详细设计；4 对外依赖契约；5 端到端业务流程；6 本模块实体状态机；7 关键决策记录；8 待定问题与风险 |

## 5 结构特征校验（防 archify 升级导致静默错位）

| 特征 | 校验方式 | 不匹配时 |
|---|---|---|
| 文件编号体系 | 正则 `^0\d-` / `^(1\d|\d\d)-`；00/01/02 固定 | 告警 + 列出实际文件名，要求人工确认映射，**停止断言抽取** |
| 契约章节 | 上表 00 的 10 节是否齐 | 告警（可能模板变了） |
| 模块章节 | 上表模块 8 节是否齐 | 同上 |
| state schema | `schema_version/state/files/reopens` 齐否 | 缺任一 → 保守按 draft，告警 |
| change-list | 是否有「关键决策」段 | 缺失 → A1 标 `skipped` 并说明 |

**原则：结构不匹配一律停下来说明。** 只有 `docstat.mjs` 的输出作为证据，不许凭印象判断"差不多"。

## 6 缺失处置

| 缺失 | 处置 |
|---|---|
| 00/01/02 任一 | 记 **P1（产物不完整）**，其余项照审 |
| 模块文档全缺 | 记 P1；D1/D2/D3 只能基于架构文档判定，报告中声明局限 |
| task.md | 记 **P1（方案列为必需）**；删去"可实现粒度"相关结论 |
| diagrams/ | 记 P3 |
| state.yaml | 无法做状态门禁与风险加权；全报告标「基准未冻结」，不得用于 Gate D 放行 |
| change-lists/ | 决策追溯标 `skipped`，D12 只能按文档内「关键决策记录」章判定 |
