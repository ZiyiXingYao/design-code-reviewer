# Lens 06: Boundaries and Numeric Units

## Checkpoints

- Empty/zero/negative/maximum values
- Unit conversion (ms/s, meters/millimeters, degrees as a unit system)
- Integer overflow/truncation
- Container out-of-bounds/invalidated iterators
- String length and encoding

## Signals (scan first, then read)

- static_cast|/ 1000|\* 1000|\[i\]|substr|stoi

## Severity ceiling

Can be P0 (out-of-bounds/overflow)

## Evidence requirements

The concrete input value + the calculation

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
