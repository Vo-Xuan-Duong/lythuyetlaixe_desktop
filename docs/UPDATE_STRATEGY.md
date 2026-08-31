# Update strategy

Application binary, `VN_GPLX_600` and `VN_TRAFFIC_SIGNS` have independent versions.

## Application version

Application version changes with code/native shell/schema/feature changes and must stay synchronized in:

```text
package.json
src-tauri/tauri.conf.json
src-tauri/Cargo.toml
```

Local check:

```powershell
pnpm release:check
```

## Questions version

Example:

```text
2025.06
2026.01
```

Bump when verified question/answer/license/explanation/question-image content changes.

Remote shape:

```text
/questions/
├── dataset-manifest.json
└── releases/<version>/
    ├── questions.json
    └── assets.zip
```

Integrity:

```text
sourceSha256  = official CSGT PDF SHA-256
contentSha256 = questions.json SHA-256
assetSha256   = assets.zip SHA-256
```

## Traffic-sign version

Version is independent from questions. Bump when verified catalog content, sign images, per-sign provenance or the official technical-source snapshot changes.

Remote shape:

```text
/traffic-signs/
├── manifest.json
└── releases/<version>/
    ├── traffic-signs.json
    └── traffic-sign-assets.zip
```

Traffic-sign official technical source is the ordered five-part Government Gazette publication of QCVN 41:2024/BGTVT:

```text
1359+1360
1361+1362
1363+1364
1365+1366
1367+1368
```

Integrity:

```text
partSha256[]  = SHA-256 of each exact Gazette PDF
sourceSha256  = canonical SHA-256 of ordered (index, issue, partSha256) rows
combinedSha256 = SHA-256 of merged local parsing PDF only
contentSha256 = traffic-signs.json SHA-256
assetSha256   = traffic-sign-assets.zip SHA-256
```

`combinedSha256` is never the production source identity. It exists so local extraction can prove its merged PDF snapshot has not changed.

Every traffic-sign production record also carries `sourceSection`, `sourcePages`, `verifiedBy`, `verifiedAt`. Records with images carry verified image provenance with QCVN source hash, section, page and crop.

## Immutable release rule

Never publish changed bytes under an existing dataset version. Local publishers enforce this for generated `releases/<version>` directories.

```text
same version + changed content = invalid
changed content → create new version
```

Root manifests are mutable pointers to immutable release payloads. Upload new release objects before replacing the root manifest.

## Independent activation

```text
Questions:
manifest → JSON verify → assets verify/install → serialized SQLite import → cleanup old question assets

Traffic signs:
manifest → JSON/provenance verify → assets verify/install → serialized SQLite import → cleanup old sign assets
```

Both network flows may run concurrently. SQLite mutations share an application-level write queue because both datasets and user data use the same SQLite handle.

Failure in one dataset does not roll back or replace the other dataset.

## Same-version self-heal

A package may be downloaded again without a version bump only when remote version/checksums still match the exact installed immutable package and local state is damaged, for example missing AppData asset directory or missing traffic-sign rows.

Same version with a changed remote checksum is **not** self-heal; it is an invalid immutable release and runtime keeps the local snapshot.

## Legacy question checksum migration

Older development builds could store `questions.json` checksum in `dataset_metadata.sourceSha256`. Migration only occurs when remote content checksum proves the exact relationship; runtime never guesses official source provenance.

Traffic-sign dataset has no equivalent legacy migration.

## Database schema versioning

Current schema history:

```text
migration v1 → questions/progress/bookmark/exam
migration v2 → traffic_sign_metadata/traffic_signs
```

Content-only dataset updates do not require SQL migrations. Any schema change must add a new migration; do not rewrite historical migrations after release.

Traffic-sign reviewer/page/image provenance is verified before import but intentionally not persisted into the compact catalog table; it remains in the immutable release JSON.

## User-data isolation

Question updates preserve:

- `user_progress`;
- bookmarks;
- exam history.

Traffic-sign updates never modify those tables. User reset operations also preserve both production datasets and their asset caches.

## Compatibility

ExamConfig is tied to compatible question/regulation periods. Never use an old question dataset to simulate a newer official exam format without verified source/config support.

Traffic-sign catalog is a learning/reference source and must not infer official question answers.

## Release decision matrix

| Change | Questions release | Sign release | New app binary |
| --- | --- | --- | --- |
| Verified question/answer change | Yes | No | No |
| Question/sa hình image change | Yes | No | No |
| Verified explanation change | Yes | No | No |
| Sign name/meaning/scope change | No | Yes | No |
| Sign image/crop/provenance change | No | Yes | No |
| Traffic-sign official source snapshot changes | No | Yes | Maybe if contract/UI changes |
| UI/business-code change | No | No | Yes |
| SQLite schema change | Maybe | Maybe | Yes |
| Download/security logic change | No required data release | No required data release | Yes |
| Compiled manifest host change | No | No | Yes |

## Production transport/security

Both manifests require HTTPS outside localhost development. Payloads must stay same-origin with their respective manifest.

Recommended deployment uses one R2 custom-domain origin with two independent roots. Before public release, restrict CSP `connect-src` to that exact origin.

SHA-256 + HTTPS/domain control is the initial trust model. Signed manifests remain optional post-1.0 hardening.

See [`R2_DEPLOYMENT.md`](./R2_DEPLOYMENT.md) for publication order/layout.

## Desktop release recommendation

Before release candidate:

1. verified questions package published;
2. verified traffic-sign package published if included in 1.0;
3. two-manifest first-run/offline/update/self-heal verified locally;
4. SQLite migration v2 and write-queue behavior verified;
5. frontend/Vitest/data/Rust checks run locally;
6. Runtime Diagnostics has no unexplained production failures;
7. NSIS install/upgrade verified on Windows 10/11.
