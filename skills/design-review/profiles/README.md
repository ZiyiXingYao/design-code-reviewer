# profiles/: language and industry specialization (optional layer)

The core criteria contain no language APIs, industry terms, or project paths. Specialization may live only here, and is **add-only, never modify**:

- Only checkpoints and cases may be appended;
- **The level caps of the core criteria must not be modified**;
- Every domain checkpoint must state "which general principle it reduces to", otherwise it must not enter this directory (black-box experience can neither be reused nor rebutted).

## Declaration format

```yaml
name: cpp
applies_to: ["*.cpp", "*.h", "*.hpp"]
extends:
  - {lens: 12-memory-safety, add_checks: ["use after move", "missing virtual destructor"]}
  - {lens: 01-lifecycle-ownership,     add_checks: ["shared_ptr reference cycle"]}
provides_cases: true
```

When no profile matches, run as core: the general criteria still hold, only the language-level details are missing.

## Directory conventions

```
profiles/
├── README.md        # this file
├── _template.md     # skeleton for a new profile
└── <name>.md        # concrete profile (added on demand)
```

## Reduction examples

| Domain pitfall | General criterion it reduces to |
|---|---|
| The state of one entity is driven by multiple threads and gets out of order | CONC-2: for an entity with an owning key, is its state handled by a single owner |
| A global lock protects a large read-only object, so a writer blocks all readers | CONC-6: does read-mostly data use immutable snapshots |
| Messages to the same peer are written directly by multiple threads, breaking sequence increments | CONC-1/2: are messages to the same peer written out in order by a single thread |

An entry that cannot state its reduction = industry folklore; delete it.
