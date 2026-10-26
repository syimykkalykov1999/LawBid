import 'package:lawbid/core/uploads/storage_uploader.dart';

/// The browser: no background transfer service — the foreground transport.
StorageTransport queueTransport({required StorageTransport fallback}) =>
    fallback;
