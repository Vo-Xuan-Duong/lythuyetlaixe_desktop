# Trạng thái triển khai hiện tại

> Branch: `main`.
>
> **CODED** = đã triển khai bằng code/static review. **LOCAL VERIFY** = cần chạy trên máy phát triển. **DEVICE VERIFY** = cần thiết bị/emulator. **DATA BLOCKER** = cần dữ liệu chính thức đã kiểm chứng. GitHub Actions manual-only.

## Tóm tắt

Application feature/tooling layer hiện gần hoàn chỉnh. Những blocker còn lại chủ yếu không phải feature code mới mà là:

1. local compile/runtime verification;
2. chạy và review bộ 600 câu thật;
3. chạy và review catalog biển báo thật từ nguồn Công báo chính thức;
4. Cloudflare R2/custom domain + CORS/CSP;
5. Windows/Android verification.

## Application core

| Khu vực | Trạng thái | Ghi chú |
| --- | --- | --- |
| Tauri 2 + React + TypeScript | CODED | Shared Desktop/Android |
| SQLite migration v1 | CODED | questions/progress/exam |
| SQLite migration v2 | CODED | `traffic_sign_metadata` + `traffic_signs` |
| Question bootstrap | CODED | `VN_GPLX_600` |
| Traffic-sign bootstrap | CODED | `VN_TRAFFIC_SIGNS` |
| Offline fallback | CODED | độc lập cho từng dataset |
| Immutable versions | CODED | same version + changed checksum không overwrite |
| SQLite application write queue | CODED | serialize bootstrap/user writes |
| Runtime diagnostics | CODED | hai dataset |
| FS least privilege | CODED | hai AppData roots |
| Production CSP foundation | CODED | exact R2 origin còn deployment task |

## Dataset 1 — 600 câu

```text
env      VITE_QUESTIONS_MANIFEST_URL
metadata dataset_metadata
assets   $APPDATA/dataset-assets/<version>/
```

Integrity:

```text
sourceSha256  = PDF nguồn chính thức
contentSha256 = questions.json
assetSha256   = assets.zip
```

### Feature layer

| Feature | Trạng thái |
| --- | --- |
| Catalog / 6 chủ đề | CODED |
| Filter/progress/mastery/bookmark | CODED |
| 60 câu điểm liệt | CODED |
| Review due/weak/wrong | CODED |
| Exam config/timer/scoring/history | CODED |
| Exam → learning progress | CODED |
| Result review từng câu | CODED |
| Dashboard/Statistics | CODED |
| Explanation production | DATA BLOCKER |
| E2E với 600 câu thật | DATA/LOCAL VERIFY |

### Tooling

Downloader, extractor, parser, underline resolver, manual answer review, image candidate extraction, manual image gate, review workspace, promotion gate, validator, publisher và status đều **CODED**.

Còn data work:

```text
official CSGT PDF
→ run parser/resolver
→ calibrate nếu cần
→ manual unresolved answers
→ manual images
→ production questions.json/assets.zip
```

## Dataset 2 — Traffic signs

```text
env      VITE_TRAFFIC_SIGNS_MANIFEST_URL
metadata traffic_sign_metadata
table    traffic_signs
assets   $APPDATA/traffic-sign-assets/<version>/
```

### Source provenance

Technical source được model thành đúng 5 phần Công báo Chính phủ:

```text
1359+1360
1361+1362
1363+1364
1365+1366
1367+1368
```

`sourceSha256` production = canonical hash của 5 part-hash. `combinedSha256` = hash PDF ghép chỉ phục vụ extraction.

| Stage | Trạng thái |
| --- | --- |
| Legal basis metadata | CODED |
| Exact 5-part Gazette manifest | CODED |
| Safe official downloader | CODED |
| Part SHA + canonical bundle SHA | CODED |
| Combined parsing PDF | CODED |
| Content verification markers | CODED |
| Exact issue-sequence gate | CODED |

### Candidate / review tooling

| Stage | Trạng thái |
| --- | --- |
| Official text candidate extractor | CODED |
| Variant sign-code parser | CODED |
| Official image candidate extractor | CODED |
| Manual review JSON generator | CODED |
| Offline review workspace | CODED |
| Candidate image gallery | CODED |
| Manual QCVN crop UI | CODED |
| Candidate/manual-crop image processor | CODED |
| Per-sign provenance gate | CODED |
| Image provenance gate | CODED |
| Exact official candidate code coverage gate | CODED |
| Runtime provenance validation | CODED |
| Local validator | CODED |
| Immutable publisher | CODED |
| `signs:status` multipart/review checkpoints | CODED |
| Production records/images | DATA BLOCKER |
| E2E first-run/offline/update | LOCAL VERIFY |

Production traffic-sign record hiện phải có source section/pages/reviewer/time. Record có ảnh còn phải có `imageVerified=true` và image provenance từ verified canonical QCVN source bundle.

## Kiến thức biển báo UI

| Feature | Trạng thái |
| --- | --- |
| 5 nhóm built-in | CODED |
| Navigation Desktop/Mobile | CODED |
| Hoạt động khi 600 câu chưa có | CODED |
| Search code/name/meaning/keyword | CODED |
| Filter 5 nhóm | CODED |
| Pagination catalog | CODED |
| Detail + AppData image | CODED |

## Windows Desktop

| Feature | Trạng thái |
| --- | --- |
| NSIS config/release command | CODED |
| Release/version docs | CODED |
| Auto GitHub validation | DISABLED — manual-only |
| `pnpm install` / lockfile | LOCAL PENDING |
| Frontend/Rust compile | LOCAL VERIFY |
| migration v2 runtime | LOCAL VERIFY |
| two-dataset first-run/offline/update | LOCAL VERIFY |
| NSIS Windows 10/11 | LOCAL VERIFY |
| code signing | OPTIONAL |

## Android

Responsive/AppData/Store/Back/Notification/build-script foundation đã **CODED**.

Cần local/device verify:

- Android SDK/JDK/NDK/Rust targets;
- `tauri android init`;
- migration v2;
- hai asset roots;
- first-run/offline/update của hai dataset;
- notification;
- APK/AAB/signing.

## Deployment còn lại

- tạo Cloudflare R2 bucket/custom domain;
- upload questions/sign packages vào hai prefix độc lập;
- `.env.production` với hai manifest URL;
- CORS GET/HEAD;
- khóa CSP về exact R2/custom-domain origin;
- clean first-run verification.

## Những việc code/static-review còn lại

Không còn blocker application feature lớn đã biết. Từ đây thay đổi code nên chủ yếu dựa trên lỗi thực tế từ local compiler/data run/runtime, thay vì thêm feature mới theo suy đoán.

## Blocker Desktop release candidate

1. `pnpm install` + frontend/unit/Rust/data checks local.
2. Hoàn thiện 600 câu production.
3. Hoàn thiện traffic-sign catalog production nếu đưa vào 1.0.
4. Publish hai package lên R2.
5. Verify first-run/offline/update/self-heal/rollback độc lập.
6. Runtime Diagnostics không còn lỗi production chưa giải thích.
7. Build/test NSIS Windows 10/11.

Checklist thao tác: [`LOCAL_HANDOFF.md`](./LOCAL_HANDOFF.md).
