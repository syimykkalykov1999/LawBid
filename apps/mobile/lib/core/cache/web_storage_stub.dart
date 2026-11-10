import 'package:lawbid/core/cache/web_storage.dart';

/// Not a browser: nothing to estimate, no Cache Storage.
WebStorageInfo createWebStorageInfo() => _None();

class _None implements WebStorageInfo {
  @override
  Future<({int usage, int quota})?> estimate() async => null;

  @override
  Future<List<String>> cacheNames() async => const [];
}
