/// Hand-written request/response DTOs for the auth endpoints wired in this
/// pass (otp/request, otp/verify, refresh, logout —
/// docs/01_FOUNDATION_AUTH.md §10.5). `packages/api-contract` is an empty
/// stub (README only, no generator wired) — these are hand-written rather
/// than generated, matching the engineering judgment recorded in
/// docs/CHANGELOG.md for this pass. Keep field names/shapes in sync with
/// apps/api/src/modules/auth/dto/*.dto.ts by hand until that package is
/// real.
library;

/// Mirrors `DeviceInfoDto` (apps/api/src/modules/auth/dto/device-info.dto.ts).
/// Every field is optional — omitting the whole object still works, it
/// just loses the "new device" signal and the refresh grace-window's
/// benign-retry match (see `RefreshTokenDto`'s doc comment in apps/api).
class DeviceInfo {
  const DeviceInfo({this.deviceId, this.deviceName, this.platform, this.appVersion});

  final String? deviceId;
  final String? deviceName;
  final String? platform;
  final String? appVersion;

  Map<String, dynamic> toJson() => {
    if (deviceId != null) 'deviceId': deviceId,
    if (deviceName != null) 'deviceName': deviceName,
    if (platform != null) 'platform': platform,
    if (appVersion != null) 'appVersion': appVersion,
  };
}

/// `POST /auth/otp/request` request body (`OtpRequestDto`).
class OtpRequestPayload {
  const OtpRequestPayload({required this.channel, required this.identifier});

  final String channel;
  final String identifier;

  Map<String, dynamic> toJson() => {'channel': channel, 'identifier': identifier};
}

/// `POST /auth/otp/verify` request body (`OtpVerifyDto`).
class OtpVerifyPayload {
  const OtpVerifyPayload({
    required this.channel,
    required this.identifier,
    required this.code,
    this.deviceInfo,
  });

  final String channel;
  final String identifier;
  final String code;
  final DeviceInfo? deviceInfo;

  Map<String, dynamic> toJson() => {
    'channel': channel,
    'identifier': identifier,
    'code': code,
    if (deviceInfo != null) 'deviceInfo': deviceInfo!.toJson(),
  };
}

/// `POST /auth/social` request body (`SocialLoginDto` —
/// apps/api/src/modules/auth/dto/social-login.dto.ts). `nonce` is always
/// the RAW nonce the native SDK call was seeded with — see
/// `PlatformSocialAuthNativeClient`'s doc comment
/// (data/social_auth_native_client.dart) for why Apple's is hashed only on
/// the way INTO the native call, never here. `firstName`/`lastName` are
/// Apple-only in practice (see that same file's doc comment on
/// `signInWithApple`) but the field names are provider-agnostic to match
/// the DTO.
class SocialLoginPayload {
  const SocialLoginPayload({
    required this.provider,
    required this.idToken,
    required this.nonce,
    this.firstName,
    this.lastName,
    this.deviceInfo,
  });

  final String provider;
  final String idToken;
  final String nonce;
  final String? firstName;
  final String? lastName;
  final DeviceInfo? deviceInfo;

  Map<String, dynamic> toJson() => {
    'provider': provider,
    'idToken': idToken,
    'nonce': nonce,
    if (firstName != null) 'firstName': firstName,
    if (lastName != null) 'lastName': lastName,
    if (deviceInfo != null) 'deviceInfo': deviceInfo!.toJson(),
  };
}

/// `POST /auth/refresh` request body (`RefreshTokenDto`). `deviceInfo` is
/// not in the docs table's request shape but IS accepted by the DTO — see
/// that file's doc comment on why it matters for the grace-window match.
class RefreshPayload {
  const RefreshPayload({required this.refreshToken, this.deviceInfo});

  final String refreshToken;
  final DeviceInfo? deviceInfo;

  Map<String, dynamic> toJson() => {
    'refreshToken': refreshToken,
    if (deviceInfo != null) 'deviceInfo': deviceInfo!.toJson(),
  };
}

/// `POST /auth/reauth` request body (`ReauthDto` —
/// apps/api/src/modules/auth/dto/reauth.dto.ts). Phase 4 of the auth
/// networking work (docs/CHANGELOG.md): `method` is hardcoded to `'otp'`
/// at the type level (a const field, not a parameter) — the DTO's own doc
/// comment says biometric is intentionally not a valid value yet (no
/// platform attestation), so there is no second value this payload could
/// ever send. `identifier` is whichever verified phone/email the code was
/// sent to — the server independently checks it belongs to the CURRENT
/// authenticated user (see `AuthService.reauth`).
class ReauthPayload {
  const ReauthPayload({required this.identifier, required this.code});

  final String identifier;
  final String code;
  final String method = 'otp';

  Map<String, dynamic> toJson() => {
    'method': method,
    'identifier': identifier,
    'code': code,
  };
}

/// `POST /auth/reauth` response body: `{reauthToken}`
/// (apps/api/src/modules/auth/auth.service.ts `reauth()`).
class ReauthTokenResult {
  const ReauthTokenResult({required this.reauthToken});

  factory ReauthTokenResult.fromJson(Map<String, dynamic> json) =>
      ReauthTokenResult(reauthToken: json['reauthToken'] as String);

  final String reauthToken;
}

/// One row of `GET /auth/sessions` (`SessionListItem` —
/// apps/api/src/modules/auth/auth.service.ts). `sessionId` is actually the
/// session CHAIN id (`session_chain_id` server-side, docs/
/// 01_FOUNDATION_AUTH.md §10.4's `sessions` table) — kept as `sessionId`
/// here to match the JSON key the server actually sends, since that's also
/// the id `DELETE /auth/sessions/:id` expects back.
class DeviceSession {
  const DeviceSession({
    required this.sessionId,
    required this.deviceId,
    required this.deviceName,
    required this.platform,
    required this.appVersion,
    required this.lastUsedAt,
    required this.createdAt,
    required this.isCurrent,
  });

  factory DeviceSession.fromJson(Map<String, dynamic> json) => DeviceSession(
    sessionId: json['sessionId'] as String,
    deviceId: json['deviceId'] as String?,
    deviceName: json['deviceName'] as String?,
    platform: json['platform'] as String?,
    appVersion: json['appVersion'] as String?,
    lastUsedAt: json['lastUsedAt'] as String?,
    createdAt: json['createdAt'] as String,
    isCurrent: json['isCurrent'] as bool,
  );

  final String sessionId;
  final String? deviceId;
  final String? deviceName;
  final String? platform;
  final String? appVersion;
  final String? lastUsedAt;
  final String createdAt;
  final bool isCurrent;
}

/// Mirrors `AuthTokensResult`
/// (apps/api/src/modules/auth/social/auth-result.types.ts) — the shared
/// response shape for otp/verify, social login, and refresh.
class AuthTokensResult {
  const AuthTokensResult({
    required this.accessToken,
    required this.refreshToken,
    required this.accessTokenExpiresIn,
    required this.isNewUser,
  });

  factory AuthTokensResult.fromJson(Map<String, dynamic> json) => AuthTokensResult(
    accessToken: json['accessToken'] as String,
    refreshToken: json['refreshToken'] as String,
    accessTokenExpiresIn: json['accessTokenExpiresIn'] as int,
    isNewUser: json['isNewUser'] as bool,
  );

  final String accessToken;
  final String refreshToken;
  final int accessTokenExpiresIn;
  final bool isNewUser;
}
