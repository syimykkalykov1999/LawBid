import 'package:lawbid/core/uploads/storage_uploader.dart';

/// The browser: no background transfer service — the foreground transport.
StorageTransport queueTransport({required StorageTransport fallback}) =>
    fallback;

/// The browser: nothing runs in the background.
Future<void> cancelBackgroundUpload(String taskId) async {}
