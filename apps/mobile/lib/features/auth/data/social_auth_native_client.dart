import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart' show sha256;
import 'package:flutter/foundation.dart'
    show TargetPlatform, defaultTargetPlatform;
import 'package:google_sign_in/google_sign_in.dart';
import 'package:lawbid/core/config/app_config.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

/// Thrown by [SocialAuthNativeClient] methods when the user dismisses the
/// native sign-in sheet — distinguishable from every other failure so
/// `RealAuthRepository` can map it to `SocialLoginResult.cancelled()`
/// without importing `sign_in_with_apple`/`google_sign_in` itself. Apple's
/// `SignInWithAppleAuthorizationException` (`AuthorizationErrorCode
/// .canceled`) and Google's `GoogleSignInException`
/// (`GoogleSignInExceptionCode.canceled`) are each caught here, in this
/// file only, and normalized to this one type.
class SocialAuthCancelledException implements Exception {
  const SocialAuthCancelledException();
}

/// One native credential, provider-agnostic, ready to hand to
/// `AuthApiClient.socialLogin` as the generated `SocialLoginDto`
/// (package:lawbid_api). [nonce] is always the RAW (unhashed) nonce — see
/// [PlatformSocialAuthNativeClient]'s doc comment on why Apple's hashing
/// happens only on the way into the native SDK call, never here.
class SocialCredential {
  const SocialCredential({
    required this.provider,
    required this.idToken,
    required this.nonce,
    this.firstName,
    this.lastName,
  });

  final String provider;
  final String idToken;
  final String nonce;
  final String? firstName;
  final String? lastName;
}

/// Native Apple/Google sign-in, isolated behind this interface so
/// `RealAuthRepository` (and tests) never import `sign_in_with_apple`/
/// `google_sign_in` directly — same reasoning as `AuthApiClient` sitting
/// between the repository and dio.
abstract interface class SocialAuthNativeClient {
  /// Throws [SocialAuthCancelledException] if the user dismisses the
  /// sheet, or lets the provider SDK's own exception propagate for
  /// anything else (`RealAuthRepository` only special-cases cancellation;
  /// every other failure falls through to `SocialLoginResult
  /// .networkError()` via its generic catch).
  Future<SocialCredential> signInWithApple();

  Future<SocialCredential> signInWithGoogle();
}

/// Real implementation backed by the `sign_in_with_apple` and
/// `google_sign_in` packages (Phase 3 of the auth networking work — see
/// docs/CHANGELOG.md). Stateless/const — nothing here needs to survive
/// beyond a single sign-in attempt.
///
/// ## Nonce handling (backend contract — apps/api's `SocialAuthService`
/// plus its Apple JWKS verifier and Google verifier)
/// - **Apple**: the server checks `sha256(rawNonce_hex) ==
///   idToken.payload.nonce`. So the RAW nonce is what goes to the backend
///   ([SocialCredential.nonce]), while the SHA-256 HEX digest of it is
///   what goes to Apple's native SDK (`nonce:` param below) — Apple embeds
///   whatever string it's given, unhashed, straight into the id_token's
///   `nonce` claim, so the hashing has to happen on our side before the
///   call, not after.
/// - **Google**: the server checks `idToken.payload.nonce == nonce`
///   (RAW, no hashing) — so the exact same raw nonce has to reach both the
///   backend AND land verbatim in the Google id_token's `nonce` claim.
///   See the `TODO(nonce-verify)` below for why that second half is not
///   fully confirmed from this environment.
class PlatformSocialAuthNativeClient implements SocialAuthNativeClient {
  const PlatformSocialAuthNativeClient();

  @override
  Future<SocialCredential> signInWithApple() async {
    final rawNonce = _generateRawNonce();
    final hashedNonce = _sha256Hex(rawNonce);
    try {
      // firstName/lastName: Apple only sends these on the device's FIRST
      // login with that Apple ID (never again, never in the id_token
      // itself) — see SocialLoginDto's doc comment
      // (apps/api/src/modules/auth/dto/social-login.dto.ts). Passed
      // through as-is; `null` on every subsequent login is expected, not
      // a bug.
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: const [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
        nonce: hashedNonce,
      );
      final idToken = credential.identityToken;
      if (idToken == null) {
        throw StateError('Apple sign-in returned no identityToken.');
      }
      return SocialCredential(
        provider: 'apple',
        idToken: idToken,
        nonce: rawNonce,
        firstName: credential.givenName,
        lastName: credential.familyName,
      );
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) {
        throw const SocialAuthCancelledException();
      }
      rethrow;
    }
  }

  // TODO(nonce-verify): `google_sign_in`'s nonce support
  // (flutter/packages PR #9267, closing flutter/flutter#85439) added a
  // `nonce` parameter to `GoogleSignIn.initialize(...)` — NOT to
  // `authenticate()` — specifically so it can be embedded in the returned
  // ID token's `nonce` claim, matching this method's usage below. Two
  // things about this are unverified from this bridge (no
  // flutter/dart/Xcode reachable to run it) and need a real-device check:
  //   1. The package's own docs say `initialize()` must be called EXACTLY
  //      ONCE per app run (see google_sign_in 7.1.1's changelog note).
  //      Re-calling it here, immediately before every `authenticate()`,
  //      is the only way to give each sign-in attempt a fresh nonce (the
  //      whole point of a nonce is that it's single-use) — but that may
  //      conflict with the "exactly once" contract in ways that only show
  //      up at runtime (e.g. it may silently no-op after the first call).
  //   2. At the time this was written, the PR's iOS platform channel
  //      implementation carried its own upstream TODO about depending on
  //      a `GoogleSignIn-iOS` SDK version bump for the nonce to actually
  //      reach the native call — so on iOS specifically, the nonce may
  //      not land in the ID token's `nonce` claim even though this
  //      Dart-level call accepts it without error.
  // If the backend starts rejecting real Google logins with
  // AUTH_SOCIAL_TOKEN_INVALID, this is the first place to check — confirm
  // with a real device + a JWT decoder that the `nonce` claim in the
  // returned `idToken` actually equals `rawNonce` below.
  @override
  Future<SocialCredential> signInWithGoogle() async {
    final rawNonce = _generateRawNonce();
    try {
      // Client ids come from AppConfig (dart-define, docs/KEYS_SETUP.md).
      // iOS needs its own OAuth client id (plus the reversed id as a URL
      // scheme — ios/Flutter/Secrets.xcconfig); without it the native SDK
      // aborts, so fail with a clear error instead. `serverClientId` (the
      // Web OAuth client) makes the ID token's `aud` the id the backend
      // lists in GOOGLE_CLIENT_IDS; Android requires it and ignores
      // `clientId` (the Android app is identified by package + SHA-1).
      if (defaultTargetPlatform == TargetPlatform.iOS &&
          AppConfig.googleIosClientId.isEmpty) {
        throw StateError(
          'Google sign-in is not configured: GOOGLE_IOS_CLIENT_ID is empty '
          '(config/dev.json, docs/KEYS_SETUP.md).',
        );
      }
      await GoogleSignIn.instance.initialize(
        clientId: AppConfig.orNull(AppConfig.googleIosClientId),
        serverClientId: AppConfig.orNull(AppConfig.googleServerClientId),
        nonce: rawNonce,
      );
      final account = await GoogleSignIn.instance.authenticate();
      final idToken = account.authentication.idToken;
      if (idToken == null) {
        throw StateError('Google sign-in returned no idToken.');
      }
      return SocialCredential(provider: 'google', idToken: idToken, nonce: rawNonce);
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) {
        throw const SocialAuthCancelledException();
      }
      rethrow;
    }
  }

  /// 32 random bytes, hex-encoded — same `Random.secure()` pattern as
  /// `HeadersInterceptor._generateUuid()`
  /// (core/network/headers_interceptor.dart), the only existing precedent
  /// in this codebase for a cryptographically-random string.
  static String _generateRawNonce() {
    final random = Random.secure();
    final bytes = List<int>.generate(32, (_) => random.nextInt(256));
    return bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  }

  static String _sha256Hex(String input) => sha256.convert(utf8.encode(input)).toString();
}
