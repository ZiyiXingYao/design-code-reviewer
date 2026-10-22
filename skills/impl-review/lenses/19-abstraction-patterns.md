# Lens 19: Abstraction and Pattern Fit

## Checkpoints

- The same dimension-typed branch repeated in ≥3 places with an identical branch set
- The same logic in ≥3 places, each ≥15 lines
- The same concept under ≥2 type/function names
- ≥3 bool parameters, or ≥7 parameters
- Conversely: interfaces with exactly 1 implementation, base classes with exactly 1 subclass, strategy branches with exactly 1 arm

- Resource acquisition/release scattered across ≥3 places (missing RAII or a unified wrapper)

## Signals (scan first, then read)

- switch statements
- Type-related if chains
- Interface definitions with exactly 1 implementation

## Severity ceiling

**All pattern-class findings are capped at P2**; concept drift that has already caused repeated defects can be P1

## Evidence requirements

Full before/after lines from the diff + list of duplicate locations

For the complete pattern-level reference see `../patterns.md` (GoF 23 reverse/forward lookup tables); this lens reports only the locations where the signal holds.

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
