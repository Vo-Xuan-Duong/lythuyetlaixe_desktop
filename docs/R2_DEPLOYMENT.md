# Cloudflare R2 deployment — two independent datasets

Ứng dụng dùng **hai dataset độc lập**. R2 chỉ là object storage/public delivery; app không chứa R2 access key hoặc secret.

## Target layout

```text
lythuyetlaixe/
├── questions/
│   ├── dataset-manifest.json
│   └── releases/
│       └── <version>/
│           ├── questions.json
│           └── assets.zip
│
└── traffic-signs/
    ├── manifest.json
    └── releases/
        └── <version>/
            ├── traffic-signs.json
            └── traffic-sign-assets.zip
```

Hai root có version/checksum/update lifecycle riêng.

## Local build of distribution payloads

### 600 questions

```powershell
pnpm dataset:finalize
```

Expected output:

```text
dist/dataset/
├── dataset-manifest.json
└── releases/<version>/
    ├── questions.json
    └── assets.zip
```

### Traffic signs

```powershell
pnpm signs:finalize
```

Expected output:

```text
dist/traffic-signs/
├── manifest.json
└── releases/<version>/
    ├── traffic-signs.json
    └── traffic-sign-assets.zip
```

The publishers reject different bytes under an already-generated release version. Change production content by creating a **new dataset version**, never by mutating an old release directory.

## Publish order

For each dataset:

1. upload `releases/<version>/...` first;
2. verify every payload object is readable from the final HTTPS origin;
3. upload/replace the root manifest **last**.

Never publish a manifest that advertises payload objects which are not already available.

## Example object keys

```text
lythuyetlaixe/questions/releases/2025.06/questions.json
lythuyetlaixe/questions/releases/2025.06/assets.zip
lythuyetlaixe/questions/dataset-manifest.json

lythuyetlaixe/traffic-signs/releases/2025.01/traffic-signs.json
lythuyetlaixe/traffic-signs/releases/2025.01/traffic-sign-assets.zip
lythuyetlaixe/traffic-signs/manifest.json
```

Use the actual verified versions emitted by the local publishers; the values above are layout examples.

## Cache policy

Versioned payloads are immutable, so they can use a long cache lifetime. Root manifests are mutable pointers and should be revalidated or use a short/no-cache policy.

Conceptually:

```text
releases/<version>/*  → long-lived immutable cache
root manifest         → revalidate / short cache
```

## Public access and CORS

The current runtime uses Web Fetch from the Tauri WebView. The public HTTPS origin therefore needs read-only CORS suitable for `GET`/`HEAD`. Do not expose write methods to the app.

The application needs only public read URLs. R2/API credentials are maintainer-only deployment credentials and must never be compiled into `.env.production`, JavaScript, Rust constants or the installer.

## App production environment

```env
VITE_QUESTIONS_MANIFEST_URL=https://<data-host>/lythuyetlaixe/questions/dataset-manifest.json
VITE_TRAFFIC_SIGNS_MANIFEST_URL=https://<data-host>/lythuyetlaixe/traffic-signs/manifest.json
```

The 600-question manifest is required for a clean first-run of Learning/Exam/Review. The traffic-sign manifest is independent: if unavailable, the built-in 5-group traffic-sign knowledge remains available and does not block the main app.

## CSP after the domain is final

Development currently allows generic HTTPS connectivity in production CSP because the final data host has not been selected. Before public release, restrict `connect-src` to the exact R2 custom-domain origin used by both manifests.

## Verification after upload

On a clean AppData profile verify:

```text
startup
  ├─ questions bootstrap → SQLite question tables + dataset-assets
  └─ traffic-sign bootstrap → traffic_signs + traffic-sign-assets
```

Then verify:

- restart with network available does not re-download unchanged payloads;
- offline restart uses both local snapshots;
- updating questions does not replace traffic signs;
- updating traffic signs does not reset questions/progress/bookmarks/exam history;
- missing local asset cache self-heals from the exact same immutable remote version;
- same version with changed remote checksum is rejected and local snapshot is retained.

## Rollout rule

Treat root manifest replacement as the final activation step. If an upload fails before that step, users continue seeing the previously advertised version.
