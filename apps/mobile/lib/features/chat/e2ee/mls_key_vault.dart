import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Item 25: where a device keeps its MLS secrets that are not inside the
/// MLS engine's own encrypted database: the signature key pair, the
/// engine's database key and the server's device id. Keychain on iOS /
/// macOS (this device only, never in iCloud), Keystore-backed on Android,
/// the vendored secure storage on the web.
abstract class MlsKeyVault {
  Future<String?> read(String key);
  Future<void> write(String key, String value);
  Future<void> delete(String key);
}

class SecureMlsKeyVault implements MlsKeyVault {
  const SecureMlsKeyVault();

  static const _storage = FlutterSecureStorage(
    iOptions: IOSOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
    mOptions: MacOsOptions(
      accessibility: KeychainAccessibility.first_unlock_this_device,
    ),
  );

  @override
  Future<String?> read(String key) => _storage.read(key: key);

  @override
  Future<void> write(String key, String value) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete(String key) => _storage.delete(key: key);
}

/// Tests: the same contract in memory.
class MemoryMlsKeyVault implements MlsKeyVault {
  final Map<String, String> values = {};

  @override
  Future<String?> read(String key) async => values[key];

  @override
  Future<void> write(String key, String value) async => values[key] = value;

  @override
  Future<void> delete(String key) async => values.remove(key);
}
