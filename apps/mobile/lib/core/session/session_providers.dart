import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart' show sha256;
import 'package:flutter/foundation.dart'
    show ErrorDescription, FlutterError, FlutterErrorDetails, debugPrint;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/session/refresh_coordinator.dart';
import 'package:lawbid/core/session/refresh_failure_policy.dart';
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

/// S15-1: waits before the 2nd and 3rd `/auth/refresh` try when the server
/// answered with a transient failure (5xx, 429, 408, SERVER_BUSY). Tests
/// override it with zeros.
final refreshRetryDelaysProvider = Provider<List<Duration>>(
  (ref) => const [Duration(seconds: 1), Duration(seconds: 3)],
);

/// S15-6: waits between the tries to write a rotated refresh token to the
/// keychain / keystore (three retries after the first attempt).
final tokenWriteRetryDelaysProvider = Provider<List<Duration>>(
  (ref) => const [
    Duration(milliseconds: 200),
    Duration(milliseconds: 800),
    Duration(seconds: 2),
  ],
);

/// Perf batch 4 (row 127): after the cached start's token refresh failed
/// for a reason that is not the token's (no network, a busy server), the
/// requests sent in this window fail at once instead of each asking
/// `/auth/refresh` again.
const refreshSoftFailureCooldown = Duration(seconds: 5);

/// Whether the CURRENT session is a demo one (access-token claim `demo`).
/// Lives here, not in features/demo, so any feature's gate can read it
/// without a cross-feature import (feature_boundaries_test).
final isDemoSessionProvider = Provider<bool>(
  (ref) =>
      ref.watch(sessionControllerProvider.select((s) => s?.isDemo)) ?? false,
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
    final String? refreshToken;
    final bool isDemo;
    try {
      // S15-2: a keychain / keystore error must end in the offline state
      // (with its auto-retry), never in a splash that never finishes. The
      // move to the hardened keychain class happens inside the read (S3-8).
      refreshToken = _pendingPersist?.token ?? await store.readRefreshToken();
      isDemo = refreshToken != null && await store.readRefreshTokenIsDemo();
    } on Object catch (e) {
      debugPrint('bootstrap: secure storage unreadable: $e');
      return SessionBootstrapResult.offline;
    }
    if (refreshToken == null) {
      // Demo mode: the demo session is gone (deleted / reset by the admin)
      // but the real account's token is still parked — go back to it.
      return await restoreRealSession()
          ? SessionBootstrapResult.signedIn
          : SessionBootstrapResult.signedOut;
    }
    try {
      await _refresh(refreshToken, isDemo: isDemo);
      return SessionBootstrapResult.signedIn;
    } on ApiException catch (e) {
      switch (classifyRefreshFailure(e)) {
        case RefreshFailureKind.network:
        case RefreshFailureKind.transient:
          // S15-1: the server is busy or unreachable; the token is kept.
          return SessionBootstrapResult.offline;
        case RefreshFailureKind.definitive:
          if (isDemo && await restoreRealSession()) {
            return SessionBootstrapResult.signedIn;
          }
          return SessionBootstrapResult.signedOut;
        case RefreshFailureKind.unknown:
          // Not a verdict on the token: show the welcome screen but keep it.
          return SessionBootstrapResult.signedOut;
      }
    } on Object {
      // A local failure (decode, keystore): not a verdict on the token.
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
    _softFailure = null;
    await _persistRefreshToken(tokens.refreshToken, isDemo: decoded.isDemo);
    _rememberClaims(decoded, tokens.refreshToken);
  }

  // ---- Perf batch 4 (row 127): open from the phone's copy -----------------
  //
  // WhatsApp / Telegram open the chat list from the local copy with no
  // round trip and sync behind it. A signed-in cold start used to wait for
  // `POST /auth/refresh` and then `GET /me/session` before the first real
  // screen (prod p95 1.4 s + 1.3 s, up to ~30 s on a weak link). Now, when
  // the phone has the last session's claims for the stored refresh token
  // and the last `/me/session` copy, the session opens from them at once
  // and the refresh runs behind it; a request waits for the refresh
  // («refresh before request», as `fresh_dio`'s `shouldRefreshBeforeRequest`
  // does). The access token itself is still never written anywhere.

  /// The claims last written, so a rotation with the same claims (every
  /// 15 minutes) costs no keychain write.
  String? _hintWritten;

  /// Phones only: on the website the credential is the HttpOnly cookie, and
  /// another tab may have signed that cookie into another account.
  static bool _canOpenCached(String storedToken) =>
      storedToken.isNotEmpty && storedToken != TokenSecureStore.cookieMarker;

  /// Binds the claims to the refresh token they came with: a hint left from
  /// another account (or a token the keychain refused) never matches.
  static String _fingerprint(String storedToken) =>
      sha256.convert(utf8.encode(storedToken)).toString().substring(0, 32);

  void _rememberClaims(SessionState s, String refreshToken) {
    final stored =
        refreshToken.isEmpty ? TokenSecureStore.cookieMarker : refreshToken;
    if (!_canOpenCached(stored)) return;
    final json = jsonEncode({
      'fp': _fingerprint(stored),
      'sub': s.sub,
      'role': s.role,
      'sid': s.sid,
      'verified': s.verified,
      'subscriptionStatus': s.subscriptionStatus,
      'demo': s.isDemo,
    });
    if (json == _hintWritten) return;
    _hintWritten = json;
    unawaited(ref.read(tokenSecureStoreProvider).writeSessionHint(json));
  }

  /// The last session's claims for the stored refresh token, as a session
  /// that [SessionState.awaitsRefresh], or null (no hint, another token, a
  /// demo flag that disagrees, the website, a session already in memory).
  /// Sets nothing; [openCached] does. Never throws.
  Future<SessionState?> cachedSession() async {
    if (state != null) return null;
    try {
      final store = ref.read(tokenSecureStoreProvider);
      final raw = await store.readSessionHint();
      if (raw == null) return null;
      final token = _pendingPersist?.token ?? await store.readRefreshToken();
      if (token == null || !_canOpenCached(token)) return null;
      final isDemo = await store.readRefreshTokenIsDemo();
      final m = jsonDecode(raw);
      if (m is! Map<String, dynamic> ||
          m['fp'] != _fingerprint(token) ||
          (m['demo'] == true) != isDemo) {
        return null;
      }
      final sub = m['sub'];
      final sid = m['sid'];
      if (sub is! String || sub.isEmpty || sid is! String) return null;
      _hintWritten = raw;
      return SessionState(
        accessToken: '',
        sub: sub,
        role: m['role'] as String?,
        sid: sid,
        verified: m['verified'] == true,
        subscriptionStatus: (m['subscriptionStatus'] as String?) ?? 'none',
        accessTokenExpiresAt: DateTime.now(),
        isDemo: isDemo,
      );
    } on Object catch (e) {
      debugPrint('cached session: $e');
      return null;
    }
  }

  /// Opens [cached] (from [cachedSession]) while nothing is signed in yet.
  void openCached(SessionState cached) {
    if (state == null && cached.awaitsRefresh) state = cached;
  }

  Object? _softFailure;
  DateTime? _softFailureAt;

  /// The cached start's refresh, in the background. A definitive rejection
  /// (revoked, expired, reused) signs out — the account's data on the phone
  /// leaves with it (`accountFilesGuardProvider`) — or, for a demo session,
  /// brings the parked real account back; no network or a busy server keeps
  /// the cached session (the offline banner shows; the next request, the
  /// network coming back or a resume tries again). Never throws.
  Future<SessionBootstrapResult> revalidate() async {
    final wasDemo = state?.isDemo ?? false;
    try {
      await _refreshCached();
      return SessionBootstrapResult.signedIn;
    } on ApiException catch (e) {
      switch (classifyRefreshFailure(e)) {
        case RefreshFailureKind.network:
        case RefreshFailureKind.transient:
          return state == null
              ? SessionBootstrapResult.signedOut
              : SessionBootstrapResult.offline;
        case RefreshFailureKind.definitive:
          if (state != null && !state!.awaitsRefresh) {
            // Another refresh already rotated the token: still signed in.
            return SessionBootstrapResult.signedIn;
          }
          _endCached();
          if (wasDemo && await restoreRealSession()) {
            return SessionBootstrapResult.signedIn;
          }
          return SessionBootstrapResult.signedOut;
        case RefreshFailureKind.unknown:
          // Not a verdict on the token, but no session either: the welcome
          // screen, as the old start did; the token stays.
          _endCached();
          return SessionBootstrapResult.signedOut;
      }
    } on Object {
      _endCached();
      return SessionBootstrapResult.signedOut;
    }
  }

  void _endCached() {
    if (state?.awaitsRefresh ?? false) state = null;
  }

  Future<String> _refreshCached() async {
    try {
      return await refreshAccessToken();
    } on Object catch (e) {
      if (state?.awaitsRefresh ?? false) {
        _softFailure = e;
        _softFailureAt = DateTime.now();
      }
      rethrow;
    }
  }

  /// The access token a request (or the realtime socket) goes out with:
  /// the current one, or — while the session [SessionState.awaitsRefresh]
  /// — the one the background refresh brings (single-flight with it).
  /// Throws when there is none (signed out, or the refresh failed; within
  /// [refreshSoftFailureCooldown] of a soft failure it throws that failure
  /// again without a new `/auth/refresh`).
  Future<String> accessTokenForRequest() async {
    final s = state;
    if (s == null) throw StateError('Signed out.');
    if (!s.awaitsRefresh) return s.accessToken;
    final failed = _softFailure;
    final at = _softFailureAt;
    if (failed != null &&
        at != null &&
        DateTime.now().difference(at) < refreshSoftFailureCooldown) {
      // ignore: only_throw_errors
      throw failed;
    }
    return _refreshCached();
  }

  /// S15-6: the refresh token the server just rotated MUST reach the disk,
  /// or the next cold start sends a spent token and refresh-reuse detection
  /// may revoke the whole family. Three retries with backoff; when all fail
  /// the new token stays in memory ([_pendingPersist], preferred over the
  /// store by every later refresh) and is written again by
  /// [flushPendingToken] (on resume). Never throws.
  Future<void> _persistRefreshToken(
    String token, {
    required bool isDemo,
  }) async {
    final store = ref.read(tokenSecureStoreProvider);
    final pending = _pendingPersist = (token: token, isDemo: isDemo);
    final delays = ref.read(tokenWriteRetryDelaysProvider);
    for (var attempt = 0;; attempt++) {
      try {
        await store.writeRefreshToken(token, isDemo: isDemo);
        if (identical(_pendingPersist, pending)) _pendingPersist = null;
        return;
      } on Object catch (e) {
        if (attempt >= delays.length) {
          debugPrint('refresh token not persisted (kept in memory): $e');
          return;
        }
        await Future<void>.delayed(delays[attempt]);
      }
    }
  }

  ({String token, bool isDemo})? _pendingPersist;

  /// True while a rotated refresh token lives only in memory (the keystore
  /// refused the write): the session is "non-persistent" until it is saved.
  bool get hasUnsavedRefreshToken => _pendingPersist != null;

  /// Retries the keystore write of a token that could not be saved (app
  /// resume, next refresh). One attempt; keeps the token when it fails again.
  Future<void> flushPendingToken() async {
    final pending = _pendingPersist;
    if (pending == null) return;
    try {
      await ref
          .read(tokenSecureStoreProvider)
          .writeRefreshToken(pending.token, isDemo: pending.isDemo);
      if (identical(_pendingPersist, pending)) _pendingPersist = null;
    } on Object catch (e) {
      debugPrint('refresh token still not persisted: $e');
    }
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
      await _refresh(real, isRealRestore: true);
      return true;
    } on ApiException catch (e) {
      if (classifyRefreshFailure(e) != RefreshFailureKind.definitive) {
        // Keep it: the next cold start / exit attempt can still succeed.
        try {
          await store.writeRealRefreshToken(real);
        } catch (e, st) {
          // The real session token could not be put back: the owner would
          // be logged out silently, so it goes to the crash sink.
          FlutterError.reportError(
            FlutterErrorDetails(
              exception: e,
              stack: st,
              library: 'session',
              context: ErrorDescription('restoring the real refresh token'),
            ),
          );
        }
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
      await flushPendingToken();
      final refreshToken =
          _pendingPersist?.token ?? await store.readRefreshToken();
      if (refreshToken == null) {
        throw StateError('No refresh token available to refresh a session.');
      }
      final isDemo = state?.isDemo ?? await store.readRefreshTokenIsDemo();
      return _refresh(refreshToken, isDemo: isDemo);
    });
  }

  Future<String> _refresh(
    String refreshToken, {
    bool isDemo = false,
    bool isRealRestore = false,
  }) async {
    final delays = ref.read(refreshRetryDelaysProvider);
    for (var attempt = 0;; attempt++) {
      try {
        final client = ref.read(authApiClientProvider);
        final deviceInfo = ref.read(deviceInfoProvider);
        final tokens = await client.refresh(
          // Owner 2026-10-22: the web cookie marker goes out as ''.
          refreshToken: TokenSecureStore.wireValue(refreshToken),
          deviceInfo: deviceInfo,
          isDemo: isDemo,
        );
        await applyTokens(tokens);
        return tokens.accessToken;
      } on Object catch (e) {
        // S15-1: only a definitive rejection (401/403 + an auth code) ends
        // the session. A busy or broken server (5xx, 429, 408, SERVER_BUSY)
        // is retried with backoff and never costs the user the token; a
        // transport failure or a local error keeps it as well.
        final kind = classifyRefreshFailure(e);
        if (kind == RefreshFailureKind.transient && attempt < delays.length) {
          await Future<void>.delayed(delays[attempt]);
          continue;
        }
        if (kind == RefreshFailureKind.definitive) {
          await _dropRejectedToken(refreshToken, force: isRealRestore);
        }
        rethrow;
      }
    }
  }

  /// Signs out after the server rejected [sent] for good. Re-reads the store
  /// first: when another refresh already rotated it (a race between the
  /// proactive timer, a 401 and a push-woken start), the stored token is a
  /// NEWER one and must not be wiped. [force]: the real account's parked
  /// token was rejected, the demo session in the store goes with it.
  Future<void> _dropRejectedToken(String sent, {bool force = false}) async {
    final store = ref.read(tokenSecureStoreProvider);
    if (!force) {
      String? current;
      try {
        current = _pendingPersist?.token ?? await store.readRefreshToken();
      } on Object {
        current = sent;
      }
      if (current != null && current != sent) return;
    }
    final wasDemo = state?.isDemo ?? false;
    state = null;
    _pendingPersist = null;
    _hintWritten = null;
    try {
      await store.clear();
      // Owner 2026-11-05: the same as a sign-out: the demo's parked token
      // waits only while a demo session is what ended here.
      if (force || !wasDemo) await store.clearRealRefreshToken();
    } on Object catch (e) {
      debugPrint('could not clear the refresh token: $e');
    }
    try {
      await ref.read(magicLinkVerifierStoreProvider).clear();
    } on Object {
      // Best effort: it is single-use on the server anyway.
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
      _pendingPersist = null;
      _hintWritten = null;
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
    final payload = jsonDecode(
      utf8.decode(base64Url.decode(normalized)),
    ) as Map<String, dynamic>;
    return SessionState(
      accessToken: tokens.accessToken,
      sub: payload['sub'] as String,
      role: payload['role'] as String?,
      sid: payload['sid'] as String,
      verified: payload['verified'] == true,
      subscriptionStatus: (payload['subscriptionStatus'] as String?) ?? 'none',
      accessTokenExpiresAt: DateTime.now().add(
        Duration(seconds: tokens.accessTokenExpiresIn),
      ),
      // docs/ops/demo-world.md: claim `demo: true` marks a demo session.
      isDemo: payload['demo'] == true,
    );
  }
}
