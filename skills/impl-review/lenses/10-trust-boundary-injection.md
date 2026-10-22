# Lens 10: Input Trust Boundary and Injection

## Checkpoints

- Is every external entry point validated?
- SQL/command/path/template injection surface
- Length and type validation
- Does failure fail closed?
- Is the internal network treated as trusted?

## Signals (scan first, then read)

- system\(|exec|popen|sprintf|strcpy|query\(|Path

## Severity ceiling

Exploitable = P0

## Evidence requirements

Attack input + the data flow to the dangerous point

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
