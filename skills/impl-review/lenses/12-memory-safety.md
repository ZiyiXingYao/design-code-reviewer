# Lens 12: Memory Safety

## Checkpoints

- Out-of-bounds read/write
- Use after free
- Uninitialized read
- Integer-to-pointer/length conversion
- Source of the memcpy length

## Signals (scan first, then read)

- memcpy|strcpy|alloca|reinterpret_cast
- Subscript operations

## Severity ceiling

Can be P0

## Evidence requirements

The calculation from input to the out-of-bounds access

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
