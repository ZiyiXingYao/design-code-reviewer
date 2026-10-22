# Lens 13: Untrusted Data Parsing and Deserialization

## Checkpoints

- Input size limit
- Recursion/nesting depth
- Type confusion
- Does deserialization execute code?
- Fallback on failure

## Signals (scan first, then read)

- parse|decode|json|protobuf|regex

## Severity ceiling

Resource exhaustion/code execution P0

## Evidence requirements

Shape of the malicious sample

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
