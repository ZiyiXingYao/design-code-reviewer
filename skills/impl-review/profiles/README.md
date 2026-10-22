# profiles/: Language and Industry Specializations (optional layer)

The core criteria contain no language API, industry term or project path. Specialization may live only here, and is **append-only, never modify**:

- it may only append checkpoints and cases;
- it **must not change the level caps of the core criteria**;
- every domain checkpoint must state "which general principle it reduces to", otherwise it is not allowed into this directory (black-box experience can neither be reused nor refuted).

## Declaration Format

```yaml
name: cpp
applies_to: ["*.cpp", "*.h", "*.hpp"]
extends:
  - {lens: 12-memory-safety, add_checks: ["use after move", "missing virtual destructor"]}
  - {lens: 01-lifecycle-ownership,     add_checks: ["shared_ptr reference cycle"]}
provides_cases: true
```

When no profile matches, run as core: the general criteria still hold, only the language-level details are missing.

## Directory Convention

```
profiles/
├── README.md        # this file
├── _template.md     # skeleton for a new profile
└── <name>.md        # concrete profiles (add as needed)
```

## Reduction Examples

| Domain pitfall | General criterion it reduces to |
|---|---|
| The same entity's state is driven by multiple threads and ends up out of order | CONC-2: for an entity with an ownership key, is its state handled by a single owner only |
| A global lock protects a large read-only object, so writers block all readers | CONC-6: for read-mostly data, is an immutable snapshot used |
| Messages to the same peer are written directly by multiple threads, breaking sequence monotonicity | CONC-1/2: are messages to the same peer written out by a single thread, in order |

An entry that cannot state its reduction = industry folklore; delete it.
