import 'package:freezed_annotation/freezed_annotation.dart';

part 'session_state.freezed.dart';

/// In-memory shape of a signed-in session (docs/01_FOUNDATION_AUTH.md
/// §10.4 access-token claims: `{sub, role, sid, verified,
/// subscriptionStatus}`). Deliberately does NOT hold the refresh token —
/// that lives only in `TokenSecureStore` (flutter_secure_storage), never in
/// widget-visible Riverpod state, so it can't leak into a widget inspector
/// or a crash report that serializes provider state.
///
/// `SessionController`'s state is `SessionState?` — null means signed out,
/// a non-null instance means signed in. [isAuthenticated] just names that
/// convention so call sites (like `AppRouterGuard`) read as intent
/// rather than a bare null check.
@freezed
abstract class SessionState with _$SessionState {
  const factory SessionState({
    required String accessToken,
    required String sub,
    required String? role,
    required String sid,
    required bool verified,
    required String subscriptionStatus,
    required DateTime accessTokenExpiresAt,
  }) = _SessionState;
  const SessionState._();

  bool get isAuthenticated => true;
}
