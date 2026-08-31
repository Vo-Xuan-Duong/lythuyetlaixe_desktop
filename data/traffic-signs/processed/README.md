# Traffic signs processed data

Production input for the traffic-sign catalog lives here after manual/source verification.

Expected local files:

```text
traffic-signs.json
assets/
  signs/...
```

`traffic-signs.json` is independent from `data/processed/questions.json`. Updating one dataset must not require changing the other.

The publisher creates a separate distribution package under `dist/traffic-signs/`.
