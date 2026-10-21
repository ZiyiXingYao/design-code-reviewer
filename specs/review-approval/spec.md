# review-approval

## Purpose

The review-approval capability documents the published behavior for users and maintainers.

## Requirements

### Requirement: 报告先交付、后人审

系统 SHALL 在进入 `reported` 时把 `REPORT.md` 与 `SUMMARY.md` 复制到 `specs/audit/<review-id>/`，使人工评审直接针对交付目录中的成品；只存在于工作目录的报告不算交付。

#### Scenario: 进入 reported 自动交付

- **WHEN** 执行 `state.mjs transition <reviewDir> reported` 且 REPORT/SUMMARY 均已写好
- **THEN** 两件成品出现在交付目录，`state.report` 记录 dir / files / delivered_at
- **AND** 不生成 task.md，状态为 reported

#### Scenario: 成品缺失

- **WHEN** REPORT.md 或 SUMMARY.md 缺失或为空
- **THEN** 拒绝进入 reported，状态保持不变，且不创建空的交付目录

#### Scenario: 报告修订后重新交付

- **WHEN** 人工评审提出疑问、报告被修订，执行 `state.mjs deliver <reviewDir>`
- **THEN** 交付目录的两件被覆盖为最新工作副本，状态保持 reported

#### Scenario: 交付落后于工作副本

- **WHEN** closed 时交付目录的 REPORT/SUMMARY/task.md 与工作副本内容不一致
- **THEN** gate G14 拒绝通过

### Requirement: 人工批准后生成修复任务

系统 SHALL 在报告产出后保持 reported 状态，只有显式传入批准人的 approve 命令才生成 task.md、复核交付三份成品并置 closed。

#### Scenario: 缺批准人

- **WHEN** 执行 approve 但未传 reviewer
- **THEN** 命令拒绝执行，状态保持不变

#### Scenario: 生成任务

- **WHEN** gate 通过且传入 reviewer
- **THEN** 在交付目录生成 task.md，按共用与 P0/P1 排序，每条任务含依赖与四段式 AI 提示词
- **AND** REPORT、SUMMARY、task.md 三份文件按工作副本重写就位后状态变为 closed

### Requirement: 依赖校验

系统 SHALL 保证 task.md 中每条任务的依赖只指向前序任务，同文件任务必须有显式顺序，依赖成环时拒绝生成。

#### Scenario: 依赖成环

- **WHEN** 两条任务互相依赖
- **THEN** 生成失败并输出具体环路径
- **AND** 不产生 task.md，状态保持 reported
