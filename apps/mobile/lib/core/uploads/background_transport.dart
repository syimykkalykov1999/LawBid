import 'package:lawbid/core/uploads/background_transport_stub.dart'
    if (dart.library.io) 'package:lawbid/core/uploads/background_transport_io.dart'
    as impl;
import 'package:lawbid/core/uploads/storage_uploader.dart';

/// Owner 2026-10-22 (audit #4 §3): the storage transport of the persistent
/// upload queue. On Android / iOS the S3 POST is handed to the OS (Android
/// WorkManager, iOS background URLSession, via `background_downloader`), so
/// it keeps going while the app is closed; anything else (the browser,
/// desktop, tests) uses [fallback].
StorageTransport queueTransport({required StorageTransport fallback}) =>
    impl.queueTransport(fallback: fallback);
