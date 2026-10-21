# review-ledger

## Purpose

The review-ledger capability documents the published behavior for users and maintainers.

## Requirements

### Requirement: 跨次账本

系统 SHALL 在人工批准时把本次发现并入 `.design-code-reviewer/ledger.yaml`，按「类型 + 归一化标题 + 归一化位置」去重，输出新增与仍存在计数。

#### Scenario: 同一缺陷换行号

- **WHEN** 两次评审的同一缺陷只差行号
- **THEN** 账本中只保留一条，last_seen 更新为最近一次
- **AND** 不把本次未出现的条目自动标为已修复

### Requirement: 覆盖下限与批量上限

系统 SHALL 按评审类型与档位校验覆盖下限，并限制单批发现 ≤15、单批格数 ≤25、子代理 ≤14。

#### Scenario: plan 放水

- **WHEN** plan 把 dimension 写成 1 且未显式豁免
- **THEN** gate 以覆盖下限不足拒绝出报告

### Requirement: 增量批恢复

系统 SHALL 允许增量批记录已填格，恢复时从下一格继续。

#### Scenario: 崩溃续跑

- **WHEN** 漏项批已填 3 格后中断
- **THEN** resume 报告该批从第 4 格继续
- **AND** 该批最终落盘后删除 partial 文件
