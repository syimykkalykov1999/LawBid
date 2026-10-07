import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/session/refresh_coordinator.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/core/session/token_secure_store.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

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
    if (refreshToken == null) {
      // Demo mode: the demo session is gone (deleted / reset by the admin)
      // but the real account's token is still parked — go back to it.
      return await restoreRealSession()
          ? SessionBootstrapResult.signedIn
          : SessionBootstrapResult.signedOut;
    }
    final isDemo = await store.readRefreshTokenIsDemo();
    try {
      await _refresh(refreshToken, isDemo: isDemo);
      return SessionBootstrapResult.signedIn;
    } on ApiException catch (e) {
      if (e.isNetworkError) return SessionBootstrapResult.offline;
      if (isDemo && await restoreRealSession()) {
        return SessionBootstrapResult.signedIn;
      }
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
    final decoded = _decode(tokens);
    state = decoded;
    await ref
        .read(tokenSecureStoreProvider)
        .writeRefreshToken(tokens.refreshToken, isDemo: decoded.isDemo);
  }

  /// Owner 2026-10-05, demo mode (docs/ops/demo-world.md): replaces the
  /// current session with [tokens] in place (no signed-out gap for the
  /// router). The caller (`DemoSessionController`) parks/restores the real
  /// refresh token and resets `GET /users/me` so the guard waits on the
  /// splash instead of routing by the previous account for a frame; the
  /// realtime socket and pushes re-key on `sub` by themselves.
  Future<void> switchSession(AuthTokensResult tokens) => applyTokens(tokens);

  /// Demo mode: brings the parked REAL account back (`lawbid.realRefreshToken`
  /// → `/auth/refresh`). Returns false when nothing was parked (a blogger
  /// who came in with a demo code) or the real token was rejected; a
  /// network failure keeps the token for the next attempt and also
  /// returns false. Never throws.
  Future<bool> restoreRealSession() async {
    final store = ref.read(tokenSecureStoreProvider);
    final String? real;
    try {
      real = await store.readRealRefreshToken();
    } catch (_) {
      return false;
    }
    if (real == null) return false;
    try {
      await store.clearRealRefreshToken();
      await _refresh(real);
      return true;
    } on ApiException catch (e) {
      if (e.isNetworkError) {
        // Keep it: the next cold start / exit attempt can still succeed.
        try {
          await store.writeRealRefreshToken(real);
        } catch (_) {}
      }
      return false;
    } catch (_) {
      return false;
    }
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
      final isDemo = state?.isDemo ?? await store.readRefreshTokenIsDemo();
      return _refresh(refreshToken, isDemo: isDemo);
    });
  }

  Future<String> _refresh(String refreshToken, {bool isDemo = false}) async {
    final store = ref.read(tokenSecureStoreProvider);
    try {
      final client = ref.read(authApiClientProvider);
      final deviceInfo = ref.read(deviceInfoProvider);
      final tokens = await client.refresh(
        refreshToken: refreshToken,
        deviceInfo: deviceInfo,
        isDemo: isDemo,
      );
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
  ///
  /// Demo mode (docs/ops/demo-world.md): when the session being cleared is a
  /// DEMO one and a real account is parked (its refresh token in
  /// `lawbid.realRefreshToken`), the real account comes back instead of a
  /// sign-out — a demo world reset by the admin must not throw a partner
  /// out of their own account. Clearing a real session also drops any
  /// parked token (there is nothing to come back to after a real sign-out).
  Future<void> clear() async {
    final wasDemo = state?.isDemo ?? false;
    final store = ref.read(tokenSecureStoreProvider);
    // Demo → real in one step (the real session replaces the demo one in
    // memory and in the store), so the router never sees a signed-out gap.
    final restored = wasDemo && await restoreRealSession();
    if (!restored) {
      state = null;
      await store.clear();
    }
    // A pending email magic-link verifier must not outlive the session.
    try {
      await ref.read(magicLinkVerifierStoreProvider).clear();
    } catch (_) {
      // Best effort — it is single-use server-side anyway.
    }
    if (!wasDemo) {
      try {
        await store.clearRealRefreshToken();
      } catch (_) {
        // Best effort.
      }
    }
  }

  SessionState _decode(AuthTokensResult tokens) {
    final parts = tokens.accessToken.split('.');
    if (parts.length != 3) {
      throw const FormatException('Access token is not a valid JWT.');
    }
    final normalized = base64Url.normalize(parts[1]);
    final payload = jsonDecode(utf8.decode(base64Url.decode(normalized)))
        as Map<String, dynamic>;
    return SessionState(
      accessToken: tokens.accessToken,
      sub: payload['sub'] as String,
      role: payload['role'] as String?,
      sid: payload['sid'] as String,
      verified: payload['verified'] as bool,
      subscriptionStatus: payload['subscriptionStatus'] as String,
      accessTokenExpiresAt:
          DateTime.now().add(Duration(seconds: tokens.accessTokenExpiresIn)),
      // docs/ops/demo-world.md: claim `demo: true` marks a demo session.
      isDemo: payload['demo'] == true,
    );
  }
}
