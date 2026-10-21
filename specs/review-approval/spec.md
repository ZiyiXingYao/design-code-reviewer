# review-approval

## Purpose

The review-approval capability documents the published behavior for users and maintainers.

## Requirements

### Requirement: 人工批准后生成修复任务

系统 SHALL 在报告产出后保持 reported 状态，只有显式传入批准人的 approve 命令才生成 task.md、交付三份成品并置 closed。

#### Scenario: 缺批准人

- **WHEN** 执行 approve 但未传 reviewer
- **THEN** 命令拒绝执行，状态保持不变

#### Scenario: 生成任务

- **WHEN** gate 通过且传入 reviewer
- **THEN** 在交付目录生成 task.md，按共用与 P0/P1 排序，每条任务含依赖与四段式 AI 提示词
- **AND** REPORT、SUMMARY、task.md 三份文件就位后状态变为 closed

### Requirement: 依赖校验

系统 SHALL 保证 task.md 中每条任务的依赖只指向前序任务，同文件任务必须有显式顺序，依赖成环时拒绝生成。

#### Scenario: 依赖成环

- **WHEN** 两条任务互相依赖
- **THEN** 生成失败并输出具体环路径
- **AND** 不产生 task.md，状态保持 reported
