import 'package:lawbid/core/cache/web_blob_store.dart';

/// No browser (phone, desktop, VM tests): bytes in memory.
WebBlobStore createWebBlobStore() => MemoryBlobStore();
