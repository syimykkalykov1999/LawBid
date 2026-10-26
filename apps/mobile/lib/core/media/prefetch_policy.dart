import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/media/data_saver.dart';
import 'package:lawbid/core/media/video_prefetch.dart';

/// S16-4: the three states of the video warm-up (`client.video_prefetch_mode`
/// in the admin Config): `off` «Выкл», `on` «Вкл», `auto` «Авто» (default).
/// «Авто» warms
/// the next reels only on an unmetered link (Wi-Fi / ethernet) and never
/// while the data saver is on; mobile data keeps the viewer's own taps only.
enum PrefetchMode { off, on, auto }

PrefetchMode prefetchModeOf(String raw) => switch (raw) {
      'off' => PrefetchMode.off,
      'on' => PrefetchMode.on,
      _ => PrefetchMode.auto,
    };

/// The pure decision (tested): [unmetered] is null while unknown, which
/// counts as «do not spend data» in «Авто».
bool prefetchAllowed({
  required PrefetchMode mode,
  required bool dataSaver,
  required bool? unmetered,
}) {
  if (dataSaver) return false;
  return switch (mode) {
    PrefetchMode.off => false,
    PrefetchMode.on => true,
    PrefetchMode.auto => unmetered ?? false,
  };
}

/// `true` while the phone is on Wi-Fi / ethernet (no mobile data in the
/// active interface set); `null` until the first answer.
class UnmeteredLink extends Notifier<bool?> {
  @override
  bool? build() {
    unawaited(_start());
    return null;
  }

  Future<void> _start() async {
    try {
      final c = Connectivity();
      state = _unmetered(await c.checkConnectivity());
      final sub = c.onConnectivityChanged.listen(
        (r) => state = _unmetered(r),
        onError: (Object _) {},
      );
      ref.onDispose(() => unawaited(sub.cancel()));
    } on PlatformException {
      // No plugin (tests): unknown.
    } on MissingPluginException {
      // Same.
    }
  }

  static bool _unmetered(List<ConnectivityResult> r) =>
      !r.contains(ConnectivityResult.mobile) &&
      (r.contains(ConnectivityResult.wifi) ||
          r.contains(ConnectivityResult.ethernet));
}

final unmeteredLinkProvider =
    NotifierProvider<UnmeteredLink, bool?>(UnmeteredLink.new);

/// Wires [HlsPrefetcher.instance] to the policy. Read once at start.
final prefetchGateProvider = Provider<void>((ref) {
  HlsPrefetcher.instance.allow = () => prefetchAllowed(
        mode: prefetchModeOf(ClientTuning.videoPrefetchMode),
        dataSaver: ref.read(dataSaverProvider),
        unmetered: ref.read(unmeteredLinkProvider),
      );
  ref.onDispose(() => HlsPrefetcher.instance.allow = () => true);
});
