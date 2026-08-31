# Local Windows release

Validation/release được thực hiện local trên Windows. GitHub validation workflow là manual-only.

## Production environment

```env
VITE_QUESTIONS_MANIFEST_URL=https://<production-host>/lythuyetlaixe/questions/dataset-manifest.json
VITE_TRAFFIC_SIGNS_MANIFEST_URL=https://<production-host>/lythuyetlaixe/traffic-signs/manifest.json
```

Installer không bundle production 600 câu hoặc full traffic-sign catalog. Hai dataset bootstrap/import độc lập.

## Local verification before release

```powershell
pnpm install
pnpm release:check
pnpm build
pnpm test
cargo check --manifest-path src-tauri/Cargo.toml
pnpm data:test
```

Production packages must already exist locally:

```text
dist/dataset/
├── dataset-manifest.json
└── releases/<questions-version>/...

dist/traffic-signs/
├── manifest.json
└── releases/<sign-version>/...
```

Traffic-sign root manifest must carry `sourcePartCount = 5` and the canonical QCVN five-part source hash.

After `.env.production`, packages and exact CSP origin are ready:

```powershell
pnpm project:status
pnpm release:candidate:check
```

Do not call a build a release candidate while strict preflight has blockers.

## Build NSIS

```powershell
pnpm release:windows:local
```

Expected output:

```text
src-tauri/target/release/bundle/nsis/
```

## Versioning

Application version is synchronized in:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

Questions and traffic signs have independent immutable dataset versions. Data-only changes do not require a new installer when the runtime contract remains compatible.

## Windows verification checklist

- clean first-run downloads/imports questions;
- traffic-sign background bootstrap imports independently;
- traffic-sign manifest with `sourcePartCount != 5` is rejected;
- migration v2 creates traffic-sign tables;
- no SQLite transaction/interleaving errors while startup bootstrap overlaps user mutations;
- offline restart supports Learning/Exam/Review and traffic-sign lookup;
- both AppData asset roots render correctly;
- questions update preserves progress/bookmarks/exam history and signs;
- sign update preserves questions/user state;
- missing local asset cache self-heals from unchanged immutable remote package;
- same-version changed checksum is rejected;
- Settings → Runtime Diagnostics has no unexplained production failures;
- install/upgrade/uninstall works on Windows 10 and Windows 11;
- installer upgrade preserves expected AppData/SQLite state.

## Security before public distribution

- use R2/custom domain as public read-only delivery;
- CORS only needs read behavior for current Web Fetch transport;
- never compile R2 write credentials/secrets into the application;
- scope production CSP `connect-src` to the exact final data origin;
- decide Windows code signing based on distribution channel.

Detailed R2 layout: [`R2_DEPLOYMENT.md`](./R2_DEPLOYMENT.md).
