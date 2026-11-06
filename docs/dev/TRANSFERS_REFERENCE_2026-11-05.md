# Parallel transfers: references (R-251, 2026-11-05)

| Our code | Source | Pin | License |
|---|---|---|---|
| `core/transfers/adaptive_limiter.dart` (`AdaptiveLimiter`) | `packages/@uppy/utils/src/RateLimitedQueue.ts`, https://github.com/transloadit/uppy | tag `uppy@4.0.0` | MIT |
| `mapAtOnce`, part workers in `storage_uploader.dart` | `__doConcurrentUpload`, `@aws-sdk/lib-storage` | as in #765 | Apache-2.0 |
| `core/transfers/tus_upload.dart` | `parallelUploads`, `splitSizeIntoParts`, tus-js-client | as in #765 | MIT |
| Pieces in `core/files/resumable_download.dart` | `example_dart/lib/download_with_trunks.dart`, https://github.com/cfug/dio | branch main, read 2026-11-05 | MIT |

Considered and not taken: `ParallelDownloadTask` of background_downloader. Its own docs say it "cannot be paused or resumed on failure", which would lose the resume we have.

## Mismatches against the source
- `AdaptiveLimiter`: Uppy's queue lives for one page, ours for the app, so `restoreIfIdle` resets it for the next file, and the floor stays at 1 (Uppy's halved `downLimit` can reach 0). Failures of any temporary kind call `rateLimit`, not only 429. Priorities and the abort API are dropped (Dio's cancel token does that).
- Pieces: dio's example asks for a 102 byte first chunk and has no resume or retry. Ours: a 4 MiB first piece (a small file stays one request), each piece continues from its part file, a piece with another total starts the file over, merged the same way.
- TUS: chunks go through the limiter only in the parallel path; the plain path is request for request as before.
