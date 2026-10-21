---
description: 恢复中断的设计/实现评审（扫描 .design-code-reviewer，按需选择）
argument-hint: "[project-dir] [--list] [--id <YYYY-MM-DD>-<design|impl>] [--json]"
allowed-tools: Bash, Read
---

用户要求恢复评审。参数：`$ARGUMENTS`

## 执行

1. **确定工程根目录**：参数里第一个不以 `--` 开头的值；没有就用当前工作目录。后续称为 `<project>`。
2. **调用 resume**（两个技能各带一份，任选其一；优先 design-review）：

   ```bash
   node "$HOME/.codebuddy/skills/design-review/scripts/resume.mjs" <project> <其余参数>
   ```

   如果该路径不存在，依次尝试 `impl-review`，或从仓库直接跑 `node skills/design-review/scripts/resume.mjs`。

3. **按退出码处理**：

   | 退出码 | 含义 | 你要做的 |
   |---|---|---|
   | 0 | 已恢复，或没有未完成 | 若输出为"没有未完成的评审"，原样告知用户；否则进入第 4 步 |
   | 1 | 目标已 closed | 告知用户不能恢复，要改结论必须开新一轮 |
   | 2 | id 非法/不存在 | 让用户从 `--list` 里选 |
   | 3 | 有多个未完成 | **把列表原样展示**，要求用户用 `--id` 指定；不要替用户选 |
   | 4 | plan.json 被改动 | 说明 sha 不匹配，询问是否 `--force` |

4. **继续评审**：带 `--json` 重跑一次，读取 `review_id`、`type`、`dir`、`next_batches`、`pending_steps`，然后：
   - `type=design` → 按 design-review 技能继续；
   - `type=impl` → 按 impl-review 技能继续。
   - 只跑 `next_batches` 与 `pending_steps` 里未完成的；**已完成批不重跑**，**不要修改 plan.json**。
   - 每批完成后用对应技能目录下的 `state.mjs batch` 落盘。
5. **收口**：全部批完成后 `gate.mjs` → 通过才 `state.mjs promote`。

## 注意

- 不要手工编辑 `.design-code-reviewer/*/state.yaml`。
- 恢复前若发现 `review.dir` 不存在或 state 解析失败，直接报告，不要重建目录。
- 恢复是续跑，不是重审：判据、档位、批次划分都沿用原来的 `plan.json`。
