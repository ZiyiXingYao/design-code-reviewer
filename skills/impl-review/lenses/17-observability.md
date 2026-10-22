# Lens 17: Observability

## Checkpoints

- Do key failures have logs (with context)?
- Do metrics cover queue/latency/error rate?
- Do logs distinguish levels?
- Can traces be chained together?
- Can business load be distinguished from lock contention?

## Signals (scan first, then read)

- LOG|log_|metric|counter|histogram

## Severity ceiling

P2

## Evidence requirements

The missing observation point + what you cannot see while troubleshooting

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
