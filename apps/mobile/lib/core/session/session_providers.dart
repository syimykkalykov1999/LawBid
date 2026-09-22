import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../features/auth/application/auth_providers.dart';
import '../../features/auth/data/auth_dtos.dart';
import 'refresh_coordinator.dart';
import 'session_state.dart';
import 'token_secure_store.dart';

part 'session_providers.g.dart';

final tokenSecureStoreProvider = Provider<TokenSecureStore>(
  (ref) => const TokenSecureStore(),
);

/// Holds the signed-in session in memory (docs/01_FOUNDATION_AUTH.md §10.4
/// access-token claims). `keepAlive: true` — the plain `@riverpod`
/// annotation defaults to autoDispose, which is wrong here: this must
/// survive screen navigation for the whole app lifetime, since
/// `authGuardRedirect` reads it on every route change and
/// `AuthInterceptor` reads it on every request.
///
/// State is `SessionState?` — null means signed out, non-null means signed
/// in; see `SessionState.isAuthenticated`'s doc comment for why that's
/// modeled as presence-of-instance rather than an extra bool field.
@Riverpod(keepAlive: true)
class SessionController extends _$SessionController {
  final _refreshCoordinator = RefreshCoordinator();

  @override
  SessionState? build() => null;

  /// Cold-start bootstrap (called once, before the first frame — see
  /// main.dart): reads a previously-stored refresh token and tries to
  /// exchange it for a fresh session. Must never throw — a failure here
  /// just means "start signed out", not a crash, since this runs before
  /// the router's first redirect decision.
  Future<void> bootstrap() async {
    final store = ref.read(tokenSecureStoreProvider);
    final refreshToken = await store.readRefreshToken();
    if (refreshToken == null) return;
    try {
      await _refresh(refreshToken);
    } catch (_) {
      state = null;
      await store.clear();
    }
  }

  /// Decodes [tokens]'s access token's claims into [SessionState] and
  /// persists the refresh token to secure storage. The access token itself
  /// is never persisted — only ever held in memory (this provider's
  /// state), reconstructed from the refresh token on every cold start via
  /// [bootstrap].
  Future<void> applyTokens(AuthTokensResult tokens) async {
    state = _decode(tokens);
    await ref.read(tokenSecureStoreProvider).writeRefreshToken(tokens.refreshToken);
  }

  /// Single-flight refresh (docs/01_FOUNDATION_AUTH.md §15 manual QA item
  /// "параллельные запросы не ломаются"): concurrent `TOKEN_EXPIRED`
  /// responses all await the SAME `/auth/refresh` call via
  /// [RefreshCoordinator] instead of each firing their own. Reads the
  /// refresh token from secure storage — there's no in-memory copy of it
  /// (see [SessionState]'s doc comment) — so this also works the very
  /// first time, from [bootstrap], before any session exists yet.
  Future<String> refreshAccessToken() {
    return _refreshCoordinator.run(() async {
      final store = ref.read(tokenSecureStoreProvider);
      final refreshToken = await store.readRefreshToken();
      if (refreshToken == null) {
        throw StateError('No refresh token available to refresh a session.');
      }
      return _refresh(refreshToken);
    });
  }

  Future<String> _refresh(String refreshToken) async {
    final store = ref.read(tokenSecureStoreProvider);
    try {
      final client = ref.read(authApiClientProvider);
      final deviceInfo = ref.read(deviceInfoProvider);
      final tokens = await client.refresh(refreshToken: refreshToken, deviceInfo: deviceInfo);
      await applyTokens(tokens);
      return tokens.accessToken;
    } catch (e) {
      state = null;
      await store.clear();
      rethrow;
    }
  }

  /// Logs out locally: clears in-memory state and secure storage. Callers
  /// that also need the server-side `/auth/logout` call go through
  /// `AuthRepository.logout()` first (see `RealAuthRepository`) — this
  /// method only ever touches local state, so it's also what
  /// `AuthInterceptor` calls when a refresh irrecoverably fails.
  Future<void> clear() async {
    state = null;
    await ref.read(tokenSecureStoreProvider).clear();
  }

  SessionState _decode(AuthTokensResult tokens) {
    final parts = tokens.accessToken.split('.');
    if (parts.length != 3) {
      throw const FormatException('Access token is not a valid JWT.');
    }
    final normalized = base64Url.normalize(parts[1]);
    final payload =
        jsonDecode(utf8.decode(base64Url.decode(normalized))) as Map<String, dynamic>;
    return SessionState(
      accessToken: tokens.accessToken,
      sub: payload['sub'] as String,
      role: payload['role'] as String?,
      sid: payload['sid'] as String,
      verified: payload['verified'] as bool,
      subscriptionStatus: payload['subscriptionStatus'] as String,
      accessTokenExpiresAt: DateTime.now().add(Duration(seconds: tokens.accessTokenExpiresIn)),
    );
  }
}
