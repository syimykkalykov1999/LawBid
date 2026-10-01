import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/connectivity/network_interface_monitor.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import '../features/cases/cases_fakes.dart';
import '../features/social/social_fakes.dart';

/// Controllable [NetworkInterfaceMonitor] (no platform channel).
class FakeNetworkMonitor implements NetworkInterfaceMonitor {
  FakeNetworkMonitor({this.up = true});

  bool up;
  final StreamController<bool> _changes = StreamController<bool>.broadcast();

  void set(bool value) {
    up = value;
    _changes.add(value);
  }

  @override
  Future<bool> hasNetwork() async => up;

  @override
  Stream<bool> get changes => _changes.stream;

  Future<void> close() => _changes.close();
}

/// Controllable [ReachabilityProbe]: answers [result], counts calls, and
/// can be held open with [hold] to observe the "checking" state.
class FakeProbe {
  bool result = true;
  int calls = 0;
  Completer<void>? hold;

  Future<bool> call() async {
    calls++;
    final gate = hold;
    if (gate != null) await gate.future;
    return result;
  }
}

/// Provider overrides for UX tests: English static strings (no drift),
/// fake connectivity plumbing.
List<Override> uxOverrides({
  FakeNetworkMonitor? monitor,
  FakeProbe? probe,
  FakeSocialRepository? social,
  FakeSearchRepository? search,
  Translator translator = const StaticTranslatorEn(),
  List<Override> extra = const [],
}) =>
    [
      translatorProvider.overrideWithValue(translator),
      networkInterfaceMonitorProvider
          .overrideWithValue(monitor ?? FakeNetworkMonitor()),
      reachabilityProbeProvider.overrideWithValue((probe ?? FakeProbe()).call),
      ...casesOverrides(),
      ...socialOverrides(social, search),
      ...extra,
    ];

/// MaterialApp + ProviderScope around [child] with an explicit
/// [MediaQueryData] (size, text scale, reduce motion, top inset).
Widget uxApp(
  Widget child, {
  required ThemeData theme,
  List<Override> overrides = const [],
  Size size = const Size(390, 844),
  double textScale = 1,
  bool disableAnimations = false,
  EdgeInsets padding = EdgeInsets.zero,
}) {
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp(
      debugShowCheckedModeBanner: false,
      theme: theme,
      home: MediaQuery(
        data: MediaQueryData(
          size: size,
          textScaler: TextScaler.linear(textScale),
          disableAnimations: disableAnimations,
          padding: padding,
          viewPadding: padding,
        ),
        child: child,
      ),
    ),
  );
}
