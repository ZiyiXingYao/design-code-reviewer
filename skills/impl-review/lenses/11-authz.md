# Lens 11: Authentication and Authorization

## Checkpoints

- Is identity per request or per connection state?
- Do authorization checks cover every entry point?
- Unauthorized access to other users' resources
- Strength of token/key validation
- Audit trail

## Signals (scan first, then read)

- token|auth|permission|role|uid

## Severity ceiling

Privilege escalation/forgery = P0

## Evidence requirements

Bypass path + missing check point

> This lens deep-reads **only the locations hit by signals**. No signal, no finding — this is the only way to keep noise under control.
