import 'package:lawbid/core/uploads/storage_uploader.dart';

/// The browser: no background transfer service — the foreground transport.
StorageTransport queueTransport({required StorageTransport fallback}) =>
    fallback;

/// The browser: nothing runs in the background.
Future<void> cancelBackgroundUpload(String taskId) async {}

/// The browser: no OS transfer exists.
Future<void> forgetBackgroundUpload(String taskId) async {}

Future<bool> backgroundUploadKnown(String taskId) async => false;

/// The browser: nothing is handed over when the tab is hidden.
const bool backgroundHandsOff = false;
