# Traffic signs processed data

Production input for the independent traffic-sign catalog is created here after source/manual verification.

Expected local workspace:

```text
data/traffic-signs/processed/
├── traffic-signs.json
└── assets/
    └── signs/
        └── ...
```

These generated files are ignored by Git. The source repository keeps only tooling, schema documentation and provenance metadata; production payload is published to remote object storage.

Check current state:

```powershell
pnpm signs:status
```

Before publishing:

```powershell
pnpm signs:validate
```

Finalize locally:

```powershell
pnpm signs:finalize
```

Output is versioned and immutable:

```text
dist/traffic-signs/
├── manifest.json
└── releases/
    └── <version>/
        ├── traffic-signs.json
        └── traffic-sign-assets.zip   # only when images are referenced
```

`traffic-signs.json` is independent from `data/processed/questions.json`. Updating one dataset must not require changing or republishing the other.
