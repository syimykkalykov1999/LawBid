import 'package:flutter/foundation.dart';

/// Why the app considers itself offline.
enum OfflineReason {
  /// The OS reports no usable network interface (airplane mode, no Wi-Fi
  /// and no cellular).
  noNetwork,

  /// An interface is up, but the LawBid API cannot be reached (captive
  /// portal, DNS/firewall trouble, server outage) — learned from real
  /// dio connection failures and the `/health/live` probe.
  serverUnreachable,
}

/// Snapshot of the app's connectivity (docs/01 §8.3 offline state).
@immutable
class ConnectivityStatus {
  const ConnectivityStatus._(this.offlineReason);

  const ConnectivityStatus.online() : this._(null);

  const ConnectivityStatus.offline(OfflineReason reason) : this._(reason);

  /// Null while online.
  final OfflineReason? offlineReason;

  bool get isOnline => offlineReason == null;
  bool get isOffline => !isOnline;

  @override
  bool operator ==(Object other) =>
      other is ConnectivityStatus && other.offlineReason == offlineReason;

  @override
  int get hashCode => offlineReason.hashCode;

  @override
  String toString() => isOnline
      ? 'ConnectivityStatus.online'
      : 'ConnectivityStatus.offline(${offlineReason!.name})';
}
