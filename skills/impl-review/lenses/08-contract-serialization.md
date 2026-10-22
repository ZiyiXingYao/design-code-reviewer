# Lens 08: Interface Contract and Serialization Symmetry

## Checkpoints

- Are serialization/deserialization fields symmetric?
- Handling of missing/unknown fields
- Version compatibility and default values
- Enum values out of range
- Byte order/alignment/length prefix

## Signals (scan first, then read)

- serialize|deserialize|to_json|from_json|encode|decode

## Severity ceiling

Cross-service parse failure P0/P1

## Evidence requirements

Field name + code locations on both sides

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
