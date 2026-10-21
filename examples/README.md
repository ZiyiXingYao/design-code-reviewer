# examples/

一个**脱敏的迷你设计集** + 可复跑脚本，用来验证评审技能里确定性的那部分。

```bash
node examples/run-mini.mjs
```

它会：

1. 把 `mini-design/` 复制到临时目录（不改动本目录）
2. 跑 `docstat`（设计基线）、`preflight`（基准等级）、`claims`（断言）、`smells`（信号）
3. 走一遍状态机：建评审目录 → 落一批 → 汇总覆盖
4. 用一份最小但合规的报告跑 `gate`，最后打印退出码

样例**不派子代理**，所以不演示对抗；对抗的完整跑法见 `skills/*/adversarial/`。
