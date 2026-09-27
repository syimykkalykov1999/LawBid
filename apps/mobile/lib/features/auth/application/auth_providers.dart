import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/network/dio_client.dart';
import '../../../core/network/headers_interceptor.dart';
import '../../../core/session/biometric_auth_service.dart';
import '../../../core/session/session_providers.dart';
import '../data/auth_api_client.dart';
import '../data/auth_dtos.dart';
import '../data/auth_repository.dart';
import '../data/magic_link_verifier_store.dart';
import '../data/real_auth_repository.dart';
import '../data/social_auth_native_client.dart';

/// dio-backed [AuthApiClient], built from the shared [dioProvider].
final authApiClientProvider = Provider<AuthApiClient>(
  (ref) => AuthApiClient(ref.watch(dioProvider)),
);

/// [DeviceInfo] sent on the token-issuing calls that accept it (otp/verify,
/// refresh — see `RefreshTokenDto`'s/`DeviceInfoDto`'s doc comments in
/// apps/api). Reuses [HeadersInterceptor]'s persisted device id so the
/// `X-Device-Id` header and the request body's `deviceInfo.deviceId`
/// always agree.
final deviceInfoProvider = Provider<DeviceInfo>(
  (ref) => DeviceInfo(
    deviceId: HeadersInterceptor.resolveDeviceId(ref),
    platform: HeadersInterceptor.platformName,
    appVersion: HeadersInterceptor.appVersion,
  ),
);

/// Native Apple/Google sign-in (Phase 3 of the auth networking work,
/// docs/CHANGELOG.md) — `const`, so this is cheap to rebuild; swappable in
/// tests the same way [authRepositoryProvider] is.
final socialAuthNativeClientProvider = Provider<SocialAuthNativeClient>(
  (ref) => const PlatformSocialAuthNativeClient(),
);

/// Swappable per the same pattern as `themeModeRepositoryProvider`
/// (docs/CHANGELOG.md stage 1.5). Real-backend wiring pass
/// (docs/CHANGELOG.md, stage-1.7-auth): `RealAuthRepository` is now the
/// default — dio-backed against the live `/auth/*` endpoints.
/// `StubAuthRepository` stays in the codebase for widget/golden tests but
/// is no longer wired here by default; override this provider explicitly
/// wherever a test still needs it. No screen or notifier should reference
/// either implementation directly — always go through this provider.
final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => RealAuthRepository(
    ref.watch(authApiClientProvider),
    ref.watch(sessionControllerProvider.notifier),
    ref.watch(deviceInfoProvider),
    ref.watch(socialAuthNativeClientProvider),
    ref.watch(magicLinkVerifierStoreProvider),
  ),
);

/// Email magic-link verifier (security review 2026-09-27) — see
/// [MagicLinkVerifierStore].
final magicLinkVerifierStoreProvider = Provider<MagicLinkVerifierStore>(
  (ref) => MagicLinkVerifierStore(),
);

/// Local Face ID/Touch ID/fingerprint gate (Phase 4 of the auth networking
/// work, docs/CHANGELOG.md) — see biometric_auth_service.dart's doc
/// comment for what it does and does not prove to the server.
final biometricAuthServiceProvider = Provider<BiometricAuthService>(
  (ref) => BiometricAuthService(),
);
