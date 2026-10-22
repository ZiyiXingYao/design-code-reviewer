# Lens 14: Secrets, Dependencies and Supply Chain

## Checkpoints

- Hard-coded keys/passwords
- Do logs leak sensitive information?
- Origin and version of new dependencies
- Known vulnerabilities in dependencies
- Does the build script pull from remote?

## Signals (scan first, then read)

- password|secret|api_key|BEGIN.*PRIVATE

## Severity ceiling

Key disclosure P0

## Evidence requirements

Location + exposure path

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
