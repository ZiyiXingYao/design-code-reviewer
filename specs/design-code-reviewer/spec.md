# design-code-reviewer 技能规格

## Purpose

为「先出设计文档、再出实现」的项目提供两个独立、可复现、可审计的评审技能，让覆盖缺口与漏检项可见。

## Requirements

### Requirement: 设计评审判据

系统 SHALL 以 15 个设计维度、20 项功能漏项、17 张场景卡评审设计文档，每项给出结论或「不适用 + 理由」，每条发现包含位置、机制与反例。

#### Scenario: 覆盖度可验证

- **WHEN** 一次设计评审结束
- **THEN** gate 校验 15/20×N/17 全覆盖，且 P0/P1 均有红-蓝-裁裁断
- **AND** 不通过时报告只能标 DRAFT

#### Scenario: 反例缺失

- **WHEN** 某条发现无法写成「给定 X → 错误行为 Y → 因为缺 Z」
- **THEN** 该条只能进入附录的风险提示，不计入 P0/P1

### Requirement: 实现评审基准

系统 SHALL 在实现评审开跑前判定基准等级 L0/L1/L2 并写入报告第 0 节；L0 不得声称「符合设计」。

#### Scenario: 无设计时降级

- **WHEN** 被审仓没有 specs/design 且未传 --require-design
- **THEN** 以 L0 运行全部 19 个镜头，并在报告与 SUMMARY 标注「未做设计对照」

#### Scenario: 强制对照

- **WHEN** 用户传 --require-design 且产物不全
- **THEN** 拒绝运行并输出 preflight-failed.md

### Requirement: 流程可恢复

系统 SHALL 以批为单位原子落盘（tmp → fsync → rename），并在崩溃后按「产物 > 日志 > state」对账。

#### Scenario: 中断续跑

- **WHEN** 评审在某批执行中被强杀
- **THEN** recover 清理 tmp、丢弃「有日志无产物」的批，并从下一批继续
- **AND** 已完成批不重跑，最终结论与不中断版本一致
