# Trạng thái triển khai hiện tại

> Branch: `main`.
>
> **CODED** = đã triển khai bằng code/static review. **LOCAL VERIFY** = cần chạy trên máy phát triển. **DEVICE VERIFY** = cần thiết bị/emulator. **DATA BLOCKER** = cần dữ liệu chính thức đã kiểm chứng. GitHub Actions manual-only.

## Tóm tắt

Application feature layer gần hoàn chỉnh. Production blockers hiện chủ yếu là:

1. local compile/runtime verification;
2. production 600 câu + ảnh đã verify;
3. production catalog biển báo từng biển + ảnh đã verify;
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
| Immutable versions | CODED | same version + checksum đổi không overwrite |
| Runtime diagnostics | CODED | kiểm tra riêng hai dataset |
| FS least privilege | CODED | hai AppData asset roots |
| Production CSP foundation | CODED | exact R2 origin còn deployment task |

## Hai dataset độc lập

### 600 câu

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

### Biển báo

```text
env      VITE_TRAFFIC_SIGNS_MANIFEST_URL
metadata traffic_sign_metadata
table    traffic_signs
assets   $APPDATA/traffic-sign-assets/<version>/
```

Integrity:

```text
sourceSha256  = tài liệu/quy chuẩn nguồn
contentSha256 = traffic-signs.json
assetSha256   = traffic-sign-assets.zip
```

Update hai dataset không phụ thuộc nhau.

## Learning / Critical / Review / Exam / Statistics

| Feature | Trạng thái |
| --- | --- |
| Catalog 600 câu / 6 chủ đề | CODED |
| Filter/progress/mastery/bookmark | CODED |
| 60 câu điểm liệt | CODED |
| Due/weak/wrong review queues | CODED |
| Exam config/timer/scoring/history | CODED |
| Exam answers → learning progress | CODED |
| Result review từng câu | CODED |
| Dashboard/Statistics SQLite | CODED |
| Explanation production | DATA BLOCKER |
| E2E với 600 câu thật | DATA/LOCAL VERIFY |

## Kiến thức / catalog biển báo

| Feature | Trạng thái |
| --- | --- |
| 5 nhóm biển báo built-in | CODED |
| Navigation/Desktop/Mobile | CODED |
| Hoạt động khi 600 câu chưa có | CODED |
| Domain model `TrafficSignRecord` | CODED |
| Remote manifest riêng | CODED |
| Runtime source/content/asset verification | CODED |
| SQLite importer/repository | CODED |
| Search theo mã/tên/ý nghĩa/keyword | CODED |
| Filter theo 5 nhóm | CODED |
| Detail card + ảnh AppData | CODED |
| Validator riêng `signs:validate` | CODED |
| Publisher riêng `signs:publish` | CODED |
| Catalog production từng biển | DATA BLOCKER |
| Hình/ý nghĩa/phạm vi/ngoại lệ verified | DATA BLOCKER |
| E2E first-run/offline/update | LOCAL VERIFY |

## Dataset 600 câu tooling

Downloader, extractor, parser, underline resolver, manual answer/image review, promotion gate, validator, publisher, status/review workspace đều **CODED**.

Còn:

- chạy PDF thật;
- calibrate underline;
- manual unresolved review;
- production package.

## Traffic-sign tooling

| Stage | Trạng thái |
| --- | --- |
| Source workspace riêng | CODED |
| Processed workspace riêng | CODED |
| Runtime schema/validation contract | CODED |
| Asset ZIP safe install | CODED |
| Local validator | CODED |
| Local publisher | CODED |
| Official per-sign data extraction/manual verification | DATA WORK |
| Production `traffic-signs.json` | DATA BLOCKER |

## Windows Desktop

| Feature | Trạng thái |
| --- | --- |
| NSIS config/release command | CODED |
| release/version docs | CODED |
| Auto GitHub validation | DISABLED — manual-only |
| `pnpm install` / lockfile | LOCAL PENDING |
| Frontend/Rust compile | LOCAL VERIFY |
| migration v2 runtime | LOCAL VERIFY |
| first-run/offline/update cả hai dataset | LOCAL VERIFY |
| NSIS Windows 10/11 | LOCAL VERIFY |
| code signing | OPTIONAL |

## Android

Foundation responsive/AppData/Store/Back/Notification/build scripts đã **CODED**.

Cần local/device verify:

- Android SDK/JDK/NDK/Rust targets;
- `tauri android init`;
- SQLite migration v2;
- hai asset roots;
- first-run/offline/update của hai dataset;
- notification;
- APK/AAB/signing.

## Deployment còn lại

- Cloudflare R2 bucket/custom domain;
- upload questions và traffic-sign packages vào hai prefix riêng;
- `.env.production` với hai manifest URL;
- CORS GET/HEAD;
- khóa CSP về exact origin;
- verify clean first-run.

## Blocker Desktop release candidate

1. `pnpm install` + compile/unit/Rust checks local.
2. Hoàn thiện 600 câu production.
3. Hoàn thiện catalog biển báo production nếu đưa vào 1.0.
4. Publish hai package lên R2.
5. First-run/offline/update/rollback verify độc lập.
6. Runtime Diagnostics không còn lỗi production.
7. Build/test NSIS Windows 10/11.

Checklist: [`LOCAL_HANDOFF.md`](./LOCAL_HANDOFF.md).
