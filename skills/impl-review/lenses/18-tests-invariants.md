# Lens 18: Tests and Invariant Coverage

## Checkpoints

- Do new branches have tests?
- Do assertions verify behavior rather than implementation?
- Are key invariants covered by tests?
- Fake tests (no assertions/run without verifying)
- Are tests reproducible?

## Signals (scan first, then read)

- TEST\(|assert|EXPECT_|describe\(

## Severity ceiling

P2; fake checkbox/fake test P0

## Evidence requirements

Test location + uncovered branch

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
