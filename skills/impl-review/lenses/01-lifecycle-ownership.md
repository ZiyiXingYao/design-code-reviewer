# Lens 01: Lifecycle and Ownership

## Checkpoints

- Are object creation points paired with destruction points?
- Is ownership single (exactly one party frees/closes)?
- Can a registered callback still reach an already-destroyed object?
- Do exception paths skip a release?
- Do move/copy semantics cause a double free?

## Signals (scan first, then read)

- new|delete|malloc|free|close|shared_ptr|weak_ptr|unique_ptr
- APIs that register callbacks

## Severity ceiling

Dangling/double free can be P0

## Evidence requirements

Give the creation point, destruction point and escape path

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
