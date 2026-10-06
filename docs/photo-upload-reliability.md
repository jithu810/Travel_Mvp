# Prompt 18: mobile photo upload reliability

## Files in this pass

- `src/lib/journey/optimize-image.ts` — shared native browser preparation and centralized limits.
- `src/components/journey/journey-builder.tsx` — prepare cover/stop photos before the existing upload; progress, duplicate protection and friendly errors.
- `src/components/auth/profile-form.tsx` — reuse the same preparation for the existing avatar uploader; no authentication changes.
- `tests/fixtures/browser-image-optimizer.ts` — load the actual utility into isolated browser tests.
- `tests/image-optimization.spec.ts` — dimensions, compression, formats, orientations, errors and cleanup.
- `tests/creation/photo-optimization.spec.ts` — actual secure upload, metadata/reload, duplicate events, rejected inputs and hosting errors.
- `playwright.images.config.ts` — isolated Chromium/WebKit/Android optimizer matrix.
- `playwright.photo-upload.config.ts` — same engines against the existing creation service fixtures.
- `docs/photo-upload-reliability.md` — this report.

The pre-existing uncommitted Prompt 17 HUD/capture changes are preserved. No changes in this pass to routes, GPS, tracks, maps, Journey Story, SEO, API handlers, SQL, buckets, RLS or signed URL generation. No dependency added or package/lockfile changes. Sharp is used only in tests through the existing Next.js installation; production processing uses native browser APIs. The existing Playwright WebKit browser runtime was downloaded for verification.

## Upload pipeline

Before: select raw file → check size/type → save journey → existing secured multipart API → private Storage upload → signed preview → persist photo path.

After: select file → lock uploader and show “Optimizing photo…” → validate/decode/prepare on the device → show “Uploading photo…” → the same save/API/Storage/signed-preview/persist sequence. The same JourneyBuilder handles search/GPS/pin-created stops, existing stops, resumed drafts and published editing. Avatar upload retains its separate secured endpoint and bucket.

The server still authenticates the user, checks journey/stop ownership, validates file bytes/type and generates a new private object path. The 15 MB server/storage limit is unchanged. Client preparation happens before saving/uploading; rejected photos do not overwrite existing photo paths. Save/upload controls are disabled during processing. A synchronous ref blocks duplicate change events before React renders.

## Image preparation

- Maximum output longest side: **2048 px**, aspect ratio preserved; never enlarge an image.
- JPEG quality: **0.83**, one encoding pass rather than repeated quality degradation.
- Small JPEG/PNG/WebP (≤1 MiB and ≤2048 px): decode to validate, retain encoded bytes, normalize filename/type/extension.
- Larger JPEG: resized/re-encoded JPEG. Opaque WebP: JPEG when processing is worthwhile. PNG remains lossless PNG; transparent WebP becomes PNG. If no resize/conversion is needed and encoding increases size, retain the original supported bytes.
- Inputs: JPEG, PNG, WebP, plus HEIC/HEIF when the platform's native image decoder supports them. Animated-image behavior is not a new feature; prepared images use the decoded still frame.
- Filename is a bounded basename, with an extension matching the actual output MIME type. Final encoded signature and byte limit are checked again.
- EXIF orientations 1–8: native decode bakes orientation into pixels; the utility does not rotate a second time. Header orientation informs the requested output dimensions. Small unchanged files retain their original orientation metadata.

Original inputs over **15 MiB** are rejected before decode, preserving the previous safety rule. Output over 15 MiB is rejected too. Pixel safety limits are 50 million pixels and 12000 px per axis, checked from bounded headers where possible and again after decode. These safety limits are separate from the 2048 px output target.

## iPhone / HEIC considerations

Use the native image-element decoder for HEIC/HEIF, then emit JPEG when decoding succeeds. A failure gives: “This image format isn't supported on this browser. Choose a JPEG, PNG or WebP image.” No HEIC conversion dependency or fallback server was added. Safari 17 introduced native HEIC support, but availability still depends on the platform/browser codec. [WebKit release notes](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/).

Automated iPhone checks use Playwright's iPhone 13 viewport/user agent with **WebKit on Windows**. These are not physical iOS Safari tests. No real HEIC/HEIF sample was available: only the unsupported/corrupt HEIC error path was verified. Physical iPhone testing is still required for Photos/camera selection, native HEIC conversion, real network upload and device memory pressure.

Suggested field check: select a normal landscape and portrait camera photo as cover and as a GPS/pinned stop photo, observe both progress states, save/reload, confirm orientation, note/rating and photo visibility. Repeat with HEIC, a small JPEG and transparent PNG; verify retry after a network interruption.

## Resource handling

Process one image at a time per uploader. Read at most 64 KiB for dimensions/signatures, not an additional full-size data URL. Prefer native `createImageBitmap` with resize/orientation options. Fall back sequentially to a native image object if needed. Output canvas is bounded to 2048 px. ImageBitmaps are closed; object URLs are revoked; handlers/source references and timers are cleared; canvas backing dimensions are reset to zero on success/error. Decode and encode each have a 15-second timeout; late bitmap completion closes the resource. The native fallback may still decode a full-resolution image internally, so physical low-memory iPhone behavior cannot be guaranteed by desktop automation.

## Hosting limitation

Vercel Functions have a **4.5 MB request-body limit**, independent of the existing 15 MB application/storage limits. [Official Vercel limits](https://vercel.com/docs/functions/limitations). The high-detail 4032×3024 JPEG test produces a 2048×1536 JPEG under 3 MiB and less than half the original bytes in all three engines. This substantially reduces normal camera-photo payloads, but there is no universal byte guarantee at a fixed quality: a large lossless PNG can still exceed the hosting limit. Such failures now receive a friendly retry/smaller-photo message, including non-JSON HTTP 413 responses. No direct-to-storage architecture or changed security model was introduced.

## Verification

Browser tests use local Supabase/Mapbox fixtures; real migration SQL is exercised independently by the existing database scripts. They do not upload to production or apply migrations.

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, zero warnings |
| `npm run build` | Passed, production build |
| `npm run test:db` | All three scripts passed: creation/storage ownership and private track RLS included |
| `node node_modules/@playwright/test/cli.js test --config playwright.images.config.ts` | 18 passed: six cases × desktop Chromium, iPhone-sized WebKit, Android-sized Chromium |
| `node node_modules/@playwright/test/cli.js test --config playwright.photo-upload.config.ts` | 6 passed: two end-to-end upload cases × the same three engines |
| `npm run test:e2e` | 114 passed; four existing mock-auth cases skipped by public-suite configuration |
| `npm run test:creation` | 70 passed; two unsupported-format wording assertions initially failed against the earlier build |
| `node node_modules/@playwright/test/cli.js test --config playwright.creation.config.ts --grep 'search recovery'` | Both failed cases passed after retaining the existing “Choose a JPEG, PNG or WebP image” wording; no existing assertions were weakened |

Optimizer tests cover a real high-detail 4032×3024 synthetic JPEG, landscape/portrait dimensions, small JPEG/PNG/WebP byte preservation, PNG/WebP transparency, all eight EXIF orientations through bitmap and image-element decoding, unsupported/corrupt files, input byte/pixel limits, object URL cleanup and failed encoding cleanup. Integration tests verify uploaded FormData bytes/MIME/extension/dimensions before continuing through the real local API, disabled save controls during upload, two immediate file-change events creating only one upload, cover/GPS stop paths, preserved IDs/notes/ratings on reload, and non-JSON HTTP 413 handling. Existing creation cases additionally cover search/pin capture, published owner editing, avatar upload, existing media, signed access and Story display.

Browser matrix: Desktop Chrome viewport 1280×720; iPhone 13 WebKit 390×664 logical viewport; Pixel 7 Chromium 412×839 logical viewport. Existing field-test cases cover 360×800, 390×844, 412×915, 844×390, 1280×900 and 1440×1000. Device emulation does not validate native Photos selection or physical iOS memory limits.

No commit, push, deployment or migration was performed.
