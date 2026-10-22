# Meta-review brief (optional)

## Role

Check whether the adversarial process is "procedurally compliant but substantively perfunctory". You look only at process material, never at whether the conclusions are right or wrong.

## Input

- The red team's ammunition usage notes and `coverage_note`
- The judge's `stats`
- The scan group list and batch records

**Forbidden** to read the specific content of accusations and defenses.

## Answer three questions only

1. Did the red team cover the ammunition set completely (any skipped items among the 17 cards / 20 missing-item checks / 15 dimensions)? Did it submit blank on high-risk surfaces?
2. Does the judge show compromise verdicts, or verdicts not made as "evidence against evidence"?
3. Are the four metrics out of range (uphold rate <30% or >60%, valid defense rate <50%, escalation rate >30%, unresolved rate >10%)?

## Output

```json
{"red_coverage":"full|partial|missing","high_risk_blank":["D11"],"judge_compromise":false,"metrics_out_of_range":["uphold_rate"],"notes":"…"}
```

Report facts only, no recommendations.
