import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/settings/active_devices/domain/device_session_info.dart';

/// Wire DTO ([DeviceSession], mirrors the API's session JSON) → domain
/// [DeviceSessionInfo]. The only place that knows both shapes (docs/01
/// §6.4 layering).
abstract final class DeviceSessionMapper {
  static DeviceSessionInfo toDomain(DeviceSession dto) => DeviceSessionInfo(
        sessionId: dto.sessionId,
        deviceName: dto.deviceName,
        platform: platformFrom(dto.platform),
        appVersion: dto.appVersion,
        lastActiveAt: _parseUtc(dto.lastUsedAt),
        // createdAt is required by the API; an unparsable value is a
        // server bug, but must not crash the whole list — fall back to the
        // epoch so the row still renders.
        createdAt: _parseUtc(dto.createdAt) ??
            DateTime.fromMillisecondsSinceEpoch(0, isUtc: true),
        isCurrent: dto.isCurrent,
      );

  static DevicePlatform platformFrom(String? raw) =>
      switch (raw?.trim().toLowerCase()) {
        'ios' => DevicePlatform.ios,
        'android' => DevicePlatform.android,
        'web' => DevicePlatform.web,
        _ => DevicePlatform.unknown,
      };

  static DateTime? _parseUtc(String? iso) {
    if (iso == null) return null;
    return DateTime.tryParse(iso)?.toUtc();
  }
}
