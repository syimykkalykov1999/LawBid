/// Wire models of the auth endpoints (docs/01_FOUNDATION_AUTH.md §10.5).
/// They come from the generated API client (`package:lawbid_api`, built from
/// packages/api-contract/openapi.json — docs/01 §6.3), so they can't drift
/// from apps/api; the aliases keep the app-side names the session layer and
/// settings screens already use.
library;

import 'package:lawbid_api/lawbid_api.dart';

/// `DeviceInfoDto` — sent with otp/verify, social and refresh. Every field
/// is optional; omitting it loses the "new device" signal and the refresh
/// grace-window's benign-retry match (see `RefreshTokenDto` in apps/api).
typedef DeviceInfo = DeviceInfoDto;

/// `AuthTokensDto` — the `data` of otp/verify, social and refresh.
typedef AuthTokensResult = AuthTokensDto;

/// One row of `GET /auth/sessions`, in the string-timestamp form the
/// active-devices feature maps to its domain model
/// (settings/active_devices/data/device_session_mapper.dart). Built from the
/// generated `SessionDto` by [DeviceSession.fromDto]; `fromJson` is kept for
/// that feature's own paginated fetch. `sessionId` is the session CHAIN id —
/// the id `DELETE /auth/sessions/{id}` takes.
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

  factory DeviceSession.fromDto(SessionDto dto) => DeviceSession(
    sessionId: dto.sessionId,
    deviceId: dto.deviceId,
    deviceName: dto.deviceName,
    platform: dto.platform,
    appVersion: dto.appVersion,
    lastUsedAt: dto.lastUsedAt?.toUtc().toIso8601String(),
    createdAt: dto.createdAt.toUtc().toIso8601String(),
    isCurrent: dto.isCurrent,
  );

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
