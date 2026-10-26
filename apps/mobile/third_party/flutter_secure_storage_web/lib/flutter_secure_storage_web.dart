/// Web storage for flutter_secure_storage, on package:web so it compiles to
/// WebAssembly.
///
/// Owner 2026-10-15 (web, step 1): values live in the tab's sessionStorage,
/// which a reload keeps and closing the tab clears. It is NOT encrypted: a
/// browser has no secure place for a secret that script can read, so
/// nothing here pretends otherwise.
///
/// Owner 2026-10-22 (step 8, audit #7): the refresh token itself is no
/// longer here — the API keeps it in an HttpOnly cookie and the app stores
/// only a marker (`TokenSecureStore.cookieMarker`). A demo session's token
/// (a throwaway demo account) is the one exception.
library flutter_secure_storage_web;

import 'package:flutter_secure_storage_platform_interface/flutter_secure_storage_platform_interface.dart';
import 'package:flutter_web_plugins/flutter_web_plugins.dart';
import 'package:web/web.dart' as web;

/// Web implementation of FlutterSecureStorage.
class FlutterSecureStorageWeb extends FlutterSecureStoragePlatform {
  static const _publicKey = 'publicKey';

  /// Registrar for FlutterSecureStorageWeb.
  static void registerWith(Registrar registrar) {
    FlutterSecureStoragePlatform.instance = FlutterSecureStorageWeb();
  }

  web.Storage get _store => web.window.sessionStorage;

  String _name(String key, Map<String, String> options) =>
      '${options[_publicKey] ?? 'FlutterSecureStorage'}.$key';

  String _prefix(Map<String, String> options) =>
      '${options[_publicKey] ?? 'FlutterSecureStorage'}.';

  List<String> _keys() => [
        for (var i = 0; i < _store.length; i++) _store.key(i)!,
      ];

  @override
  Future<bool> containsKey({
    required String key,
    required Map<String, String> options,
  }) async =>
      _store.getItem(_name(key, options)) != null;

  @override
  Future<void> delete({
    required String key,
    required Map<String, String> options,
  }) async {
    _store.removeItem(_name(key, options));
  }

  @override
  Future<void> deleteAll({required Map<String, String> options}) async {
    final prefix = _prefix(options);
    for (final k in _keys().where((k) => k.startsWith(prefix))) {
      _store.removeItem(k);
    }
  }

  @override
  Future<String?> read({
    required String key,
    required Map<String, String> options,
  }) async =>
      _store.getItem(_name(key, options));

  @override
  Future<Map<String, String>> readAll({
    required Map<String, String> options,
  }) async {
    final prefix = _prefix(options);
    return {
      for (final k in _keys().where((k) => k.startsWith(prefix)))
        k.substring(prefix.length): _store.getItem(k) ?? '',
    };
  }

  @override
  Future<void> write({
    required String key,
    required String value,
    required Map<String, String> options,
  }) async {
    _store.setItem(_name(key, options), value);
  }
}
