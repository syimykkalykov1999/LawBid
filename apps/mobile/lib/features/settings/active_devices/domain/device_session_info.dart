import 'package:flutter/foundation.dart';

/// Platform a session was opened from (`X-Platform`, docs/01 §7).
enum DevicePlatform { ios, android, web, unknown }

/// One signed-in session/device of the current account — the domain view
/// of "Активные устройства" (docs/01 §10.4). Presentation depends on this
/// type only, never on the wire DTO (docs/01 §6.4: "presentation не знает
/// про dio и ... DTO, только про domain").
@immutable
class DeviceSessionInfo {
  const DeviceSessionInfo({
    required this.sessionId,
    required this.platform,
    required this.createdAt,
    required this.isCurrent,
    this.deviceName,
    this.appVersion,
    this.lastActiveAt,
  });

  final String sessionId;

  /// Null/blank when the client never reported a name.
  final String? deviceName;
  final DevicePlatform platform;
  final String? appVersion;

  /// UTC; null when the server has no activity timestamp yet.
  final DateTime? lastActiveAt;
  final DateTime createdAt;

  /// The session this app instance is using right now.
  final bool isCurrent;

  bool get hasName => deviceName != null && deviceName!.trim().isNotEmpty;

  @override
  bool operator ==(Object other) =>
      other is DeviceSessionInfo &&
      other.sessionId == sessionId &&
      other.deviceName == deviceName &&
      other.platform == platform &&
      other.appVersion == appVersion &&
      other.lastActiveAt == lastActiveAt &&
      other.createdAt == createdAt &&
      other.isCurrent == isCurrent;

  @override
  int get hashCode => Object.hash(
        sessionId,
        deviceName,
        platform,
        appVersion,
        lastActiveAt,
        createdAt,
        isCurrent,
      );
}
