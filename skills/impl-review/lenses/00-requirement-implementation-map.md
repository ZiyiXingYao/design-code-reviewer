# Lens 00: Requirement–Implementation Map

## Checkpoints

- Can every [实现的功能] item in task.md be located in the code?
- Does every changed file trace back to some requirement/constraint?
- Is there any undesigned implementation ("in code, not in task")?
- Is there any gap ("in task, not in code")?

## Signals (scan first, then read)

- task.md checkboxes
- New files and entry points in the diff

## Severity ceiling

Missing = P1; fake checkbox = P0 (DR-8)

## Evidence requirements

Must give the task.md paragraph + code location

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
