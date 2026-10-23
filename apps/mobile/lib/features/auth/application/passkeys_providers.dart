import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/data/passkey_authenticator.dart';
import 'package:lawbid/features/auth/data/passkeys_api_client.dart';
import 'package:lawbid/features/auth/data/passkeys_repository.dart';
import 'package:lawbid/features/auth/domain/passkey.dart';

export 'package:lawbid/features/auth/data/passkeys_repository.dart'
    show PasskeysRepository;
export 'package:lawbid/features/auth/domain/passkey.dart';

/// Owner 2026-10-22 (checklist §1): the admin flag that shows «Sign in
/// with Face ID / fingerprint» and «Add a key» (default on; the server
/// side is the API worker's `@simplewebauthn/server` endpoints).
const kPasskeyLoginFlag = 'passkey_login';

/// The device half (tests override it with a fake).
final passkeyAuthenticatorProvider = Provider<PasskeyAuthenticatorPort>(
  (ref) => CorbadoPasskeyAuthenticator(),
);

final passkeysRepositoryProvider = Provider<PasskeysRepository>(
  (ref) => ApiPasskeysRepository(
    client: PasskeysApiClient(ref.watch(dioProvider)),
    authenticator: ref.watch(passkeyAuthenticatorProvider),
    session: ref.watch(sessionControllerProvider.notifier),
    deviceInfo: ref.watch(deviceInfoProvider),
  ),
);

/// Whether to offer passkeys at all: the flag and the device's support.
final passkeysAvailableProvider = FutureProvider<bool>((ref) async {
  if (!ref.watch(featureFlagsControllerProvider).isEnabled(kPasskeyLoginFlag)) {
    return false;
  }
  return ref.watch(passkeysRepositoryProvider).isSupported();
});

/// Settings → Security: the account's passkeys with add / remove.
class MyPasskeysNotifier extends AsyncNotifier<List<PasskeyInfo>> {
  @override
  Future<List<PasskeyInfo>> build() =>
      ref.watch(passkeysRepositoryProvider).list();

  /// Throws (`ApiException`, `PasskeyAuthenticatorException`).
  Future<PasskeyInfo> add({String? name}) async {
    final key = await ref.read(passkeysRepositoryProvider).add(name: name);
    state = AsyncData([...state.value ?? const [], key]);
    return key;
  }

  /// Throws `ApiException`; the row is gone at once and back on failure.
  Future<void> remove(String id) async {
    final before = state.value ?? const <PasskeyInfo>[];
    state = AsyncData([
      for (final k in before)
        if (k.id != id) k,
    ]);
    try {
      await ref.read(passkeysRepositoryProvider).remove(id);
    } catch (_) {
      state = AsyncData(before);
      rethrow;
    }
  }
}

final myPasskeysProvider =
    AsyncNotifierProvider.autoDispose<MyPasskeysNotifier, List<PasskeyInfo>>(
  MyPasskeysNotifier.new,
);
