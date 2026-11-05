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

/// Stops the OS transfer of the queue job [taskId], if one runs (the user
/// cancelled the upload). Best effort; a no-op where there is no OS service.
Future<void> cancelBackgroundUpload(String taskId) =>
    impl.cancelBackgroundUpload(taskId);

/// Forgets the OS record of the queue job [taskId], so its file can be sent
/// again (a finished record makes the transport send nothing).
Future<void> forgetBackgroundUpload(String taskId) =>
    impl.forgetBackgroundUpload(taskId);

/// Whether the OS holds a transfer of the queue job [taskId] that is running
/// or finished (it must not be sent a second way).
Future<bool> backgroundUploadKnown(String taskId) =>
    impl.backgroundUploadKnown(taskId);

/// Whether queued uploads have an OS transfer to fall back on when the app
/// leaves the screen.
bool get backgroundHandsOff => impl.backgroundHandsOff;
