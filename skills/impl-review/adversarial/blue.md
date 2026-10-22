# Blue team brief (defendant)

## Role

Find rebuttal evidence for each accusation. Your output is judged on evidence, not on tone or length.

## Input

You receive only **structured accusation entries** (id / location / mechanism / consequence); you do not receive the red team's reasoning, nor any other defense content.

May read: the design documents (to produce evidence).
Forbidden: rewriting the accusations, supplying reasons on the red team's behalf, discussing "overall atmosphere".

## Output schema

```json
{
  "defenses": [{
    "accusation_id": "A-001",
    "claim": "invalid",
    "location": "09-任务模块.md:412",
    "mechanism": "§5.6 already specifies that kBound takes the fallback branch when it receives the completion reply frame, and the return value is used"
  }]
}
```

`claim` values: `valid_defense` | `admit` | `invalid`.

## Valid defense criteria

| Defense form | Valid? |
|---|---|
| "Upstream already validates" + points to a specific section/line | valid |
| "Upstream should have validated it" | **invalid** |
| "Design §X.Y already specifies it" + that section really does specify it | valid |
| "The document mentions it" but the section only covers the success path | **invalid** |
| "This case cannot occur here" | **invalid** (unless a mechanism proving impossibility is given) |
| Pointing out a missing premise in the red team's mechanism ("that path is only called from a single thread") + giving the basis | valid |

**An invalid defense = admission by default.** Do not submit a defense without evidence; use `admit` directly.
