# design / impl 评审技能 任务

> 顺序即执行顺序。每项"证明"是完成判据，缺失即未完成。

## W0 仓库骨架与状态机

- [ ] **0.1 仓库骨架**：README 占位、`package.json`（type=module、scripts.test=node --test tests/）、`.gitignore`（排除内部方案原文与 evals/）、`install.mjs`（安装/更新/卸载两个技能到 ~/.codebuddy/skills，支持 --dry-run/--force，成功不残留备份）。证明：`node install.mjs --dry-run` 打印两目标路径且不写盘。
- [ ] **0.2 共享状态机 `state.mjs`**（design/impl 各一份）：批级原子写 tmp→fsync→rename；progress.log JSONL；恢复对账（产物 > 日志 > state）；清理 *.tmp；.partial.json 跳过已填格；只允许本脚本写 state.yaml。证明：单测覆盖 4 种对账分支。
- [ ] **0.3 闸门 `gate.mjs`**（各一份）：校验步骤终态、覆盖度、发现质量、对抗完整性（无折中）、基准等级标注（L0 不得称"符合设计"）、报告可追溯、批产物完整、无 tmp、扫描组 7 组齐、指标由 verdict.stats 计算、交接块存在；输出 gate-result.md。证明：fixture 缺 1 张场景卡时退出码非 0 并列出缺项。

## W1 design 技能

- [ ] **1.1 `contract/`**：artifacts.md（固定文件名/编号规则/state schema/change-list 四段/模板章节表）、craft-checklist.md（工艺合规 8 项）。证明：对 /code/das 与 /code/sim 各校验一次，特征全命中无告警。
- [ ] **1.2 判据四件套**：dimensions.md（D1–D15）、completeness.md（20 漏项）、scenarios.md（17 卡）、findings.md（反例构造/P0–P3/取证格式）；D14 三层判定与 D15 信号表含级别上限。证明：15/20/17 计数正确，抽查 3 条含不合格判据与反例。
- [ ] **1.3 报告与技能入口**：report.md（11 节 + 交接块）、SKILL.md（≤300 行，五+一条铁律、A0–A7、风险加权、档位、边界）。证明：wc -l ≤300，步骤表与方案 §3.4 对应。
- [ ] **1.4 对抗任务书六份**：orchestrator/scout/red/blue/judge/meta，自包含（角色/KPI/白名单/弹药/输出 schema/覆盖声明）。证明：无"见主对话"依赖，red 双 KPI 覆盖 S2/S3/S5。
- [ ] **1.5 `docstat.mjs`**：行数、reopen 风险分级、待定项、编号连续性、D14/D15 信号扫描。证明：在 /code/sim 输出风险表；fixture 命中"周期 ≥ 超时"。

## W2 impl 技能

- [ ] **2.1 镜头与漂移判据**：lenses/00–20（信号 + 级别上限 + 取证）、drift.md（DR-1~8）、claims.md（七类断言映射）。证明：镜头 19/20 仅信号触发；DR-8=P0。
- [ ] **2.2 脚本三件**：preflight.mjs（子模块体检 + L0/L1/L2）、claims.mjs（断言三态）、smells.mjs（重复分派/重复实现/概念漂移/sleep 轮询/阻塞回调/过度设计，只出信号）。证明：fixture 三态齐备；smells 输出 文件:行+信号+命中数。
- [ ] **2.3 报告与技能入口**：report.md（第 0 节强制基准等级）、SKILL.md（≤300 行，B0–B8、五类对照、三档、L0 边界）。证明：L0 报告不得出现"符合设计"（gate 强制）。
- [ ] **2.4 对抗任务书**：复用 orchestrator/scout/blue/judge/meta，red 弹药库换 20 镜头触发条件 + 信任边界 + 恶意输入 + 并发交错 + 负向约束。证明：red 覆盖声明点名高风险面。

## W3 自测与验收

- [ ] **3.1 自测套件**：tests/state|gate|smells|docstat|install + fixtures（最小 design 树/残缺树/代码树）。覆盖四条硬约束：gate 拒绝、恢复对账、L0 标注、去重先于对抗。证明：node --test tests/ 全绿。
- [ ] **3.2 /code/sim 只读实跑**：标准档 A0→A7，产物写 evals/2026-10-21-sim/，gate 通过，抽 5 条溯源，与历史 audit 做漏检对照。证明：plan/state/batches/REPORT/SUMMARY 齐全，不写 /code/sim。

## W4 交付

- [ ] **4.1 README**：定位、安装、触发词、档位、边界、验收摘要。
- [ ] **4.2 GitHub 公开仓**：gh repo create design-code-reviewer --public，单次提交并推送。证明：gh repo view 显示 public 且 HEAD 已推送。
