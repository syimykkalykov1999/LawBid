import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/config/client_tuning.dart';

/// OS-level "is any network interface up" signal. Abstracted so the
/// `ConnectivityService` logic is testable without platform channels.
abstract interface class NetworkInterfaceMonitor {
  /// Current state; `true` when at least one interface (Wi-Fi, cellular,
  /// ethernet, VPN, …) is up.
  Future<bool> hasNetwork();

  /// Emits whenever the interface set changes.
  Stream<bool> get changes;
}

/// [NetworkInterfaceMonitor] over `connectivity_plus`.
///
/// connectivity_plus only reports interfaces, never real reachability
/// (its own docs say so) — that is why `ConnectivityService` combines it
/// with dio failures and a health probe. If the plugin is unavailable
/// (unit/widget tests, an unsupported platform) the monitor reports
/// "network present" instead of throwing, so the app degrades to the
/// dio-based reachability signal alone rather than claiming to be offline.
class ConnectivityPlusMonitor implements NetworkInterfaceMonitor {
  ConnectivityPlusMonitor([Connectivity? connectivity])
      : _connectivity = connectivity ?? Connectivity();

  final Connectivity _connectivity;

  /// Mobile data is the only way online (S20-9: reel warm-up is lighter
  /// there). Wi-Fi, ethernet or VPN next to it means not metered.
  static bool isMetered(List<ConnectivityResult> results) =>
      results.contains(ConnectivityResult.mobile) &&
      !results.any(
        (r) =>
            r == ConnectivityResult.wifi ||
            r == ConnectivityResult.ethernet ||
            r == ConnectivityResult.vpn,
      );

  static bool _isUp(List<ConnectivityResult> results) {
    ClientTuning.metered = isMetered(results);
    return results.any((r) => r != ConnectivityResult.none);
  }

  @override
  Future<bool> hasNetwork() async {
    try {
      return _isUp(await _connectivity.checkConnectivity());
    } on PlatformException {
      return true;
    } on MissingPluginException {
      return true;
    }
  }

  @override
  Stream<bool> get changes => _connectivity.onConnectivityChanged
      .map(_isUp)
      .handleError((Object? _) {}, test: _isPluginError);

  static bool _isPluginError(Object? error) =>
      error is PlatformException || error is MissingPluginException;
}
