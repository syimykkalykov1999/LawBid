import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../features/auth/application/auth_providers.dart';
import '../../features/auth/data/auth_dtos.dart';
import '../network/api_error.dart';
import 'refresh_coordinator.dart';
import 'session_state.dart';
import 'token_secure_store.dart';

part 'session_providers.g.dart';

/// Outcome of [SessionController.bootstrap].
enum SessionBootstrapResult { signedIn, signedOut, offline }

final tokenSecureStoreProvider = Provider<TokenSecureStore>(
  (ref) => const TokenSecureStore(),
);

/// Holds the signed-in session in memory (docs/01_FOUNDATION_AUTH.md §10.4
/// access-token claims). `keepAlive: true` — the plain `@riverpod`
/// annotation defaults to autoDispose, which is wrong here: this must
/// survive screen navigation for the whole app lifetime, since
/// `AppRouterGuard` reads it on every route change and
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

  /// Cold-start bootstrap (run by the Splash screen's startup sequence —
  /// docs/01_FOUNDATION_AUTH.md §10.2 A): reads a previously-stored refresh
  /// token and tries to exchange it for a fresh session. Never throws.
  ///
  /// Stage 1.7 mobile: a NETWORK failure no longer wipes the stored refresh
  /// token (it used to, which silently logged out anyone who opened the app
  /// offline) — it reports [SessionBootstrapResult.offline] so the splash
  /// can show the offline state with Retry. Only a definitive server
  /// rejection (expired/reused/revoked refresh token) clears it.
  Future<SessionBootstrapResult> bootstrap() async {
    final store = ref.read(tokenSecureStoreProvider);
    final refreshToken = await store.readRefreshToken();
    if (refreshToken == null) return SessionBootstrapResult.signedOut;
    try {
      await _refresh(refreshToken);
      return SessionBootstrapResult.signedIn;
    } on ApiException catch (e) {
      if (e.isNetworkError) return SessionBootstrapResult.offline;
      return SessionBootstrapResult.signedOut;
    } catch (_) {
      state = null;
      await store.clear();
      return SessionBootstrapResult.signedOut;
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
    } on ApiException catch (e) {
      // A transport failure says nothing about the refresh token's
      // validity — keep it so the next attempt (Retry on the splash, or the
      // next request) can still succeed. Everything else is a definitive
      // rejection by the server.
      if (!e.isNetworkError) {
        state = null;
        await store.clear();
      }
      rethrow;
    } catch (_) {
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
    // A pending email magic-link verifier must not outlive the session.
    try {
      await ref.read(magicLinkVerifierStoreProvider).clear();
    } catch (_) {
      // Best effort — it is single-use server-side anyway.
    }
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
