import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:video_player/video_player.dart';

/// Owner 2026-10-18: a video plays only while its screen is really on
/// screen. It stops (and plays on when back, like Instagram) when:
///
/// * another bottom-nav tab is opened — the shell keeps every tab alive in
///   an `IndexedStack`, the hidden ones under `TickerMode(enabled: false)`;
///   so does a hidden sub-tab of an `IndexedStack` and a screen covered by
///   an opaque route (the `Overlay` turns tickers off below it);
/// * a route (a screen, a sheet, a dialog) is pushed over its own route
///   (`ModalRoute.isCurrent`), or its route is popped (back) — silent from
///   the first frame of the back animation, not only once it is gone;
/// * the app leaves the foreground (inactive, hidden, paused).
///
/// A state mixes this in, reads [playbackVisible] wherever it decides to
/// play, and gets [didChangePlaybackVisibility] when it flips.
mixin PlaybackVisibility<T extends StatefulWidget> on State<T> {
  late final _LifecycleHook _hook = _LifecycleHook(_onLifecycle);
  bool _foreground = _isForeground(WidgetsBinding.instance.lifecycleState);
  bool _tickers = true;
  bool _routeCurrent = true;
  bool _popping = false;
  Animation<double>? _routeAnimation;
  bool? _reported;

  /// Paused by [holdPlayback] (not by the viewer): play on when back.
  bool _held = false;

  /// The video may play: its tab and route are on screen and the app is
  /// in the foreground.
  bool get playbackVisible =>
      _foreground && _tickers && _routeCurrent && !_popping;

  /// [playbackVisible] changed to [visible].
  @protected
  void didChangePlaybackVisibility({required bool visible}) {}

  /// For a state driving one controller by hand: pauses [c] while hidden
  /// and plays it on when visible again — only if it was this pause that
  /// stopped it (a video the viewer paused stays paused).
  @protected
  void holdPlayback(VideoPlayerController? c, {required bool visible}) {
    if (c == null || !c.value.isInitialized) return;
    if (!visible) {
      if (c.value.isPlaying) {
        _held = true;
        unawaited(c.pause());
      }
    } else if (_held) {
      _held = false;
      unawaited(c.play());
    }
  }

  /// Plays [c] now when on screen; otherwise as soon as it is.
  @protected
  Future<void> playWhenVisible(VideoPlayerController c) async {
    if (playbackVisible) {
      await c.play();
    } else {
      _held = true;
    }
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(_hook);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _tickers = TickerMode.valuesOf(context).enabled;
    final route = ModalRoute.of(context);
    _routeCurrent = route?.isCurrent ?? true;
    final animation = route?.animation;
    if (animation != _routeAnimation) {
      _routeAnimation?.removeStatusListener(_onRouteStatus);
      _routeAnimation = animation?..addStatusListener(_onRouteStatus);
      _popping = animation?.status == AnimationStatus.reverse;
    }
    _report();
  }

  /// The route's own animation runs backwards only while it is popped.
  void _onRouteStatus(AnimationStatus status) {
    _popping = status == AnimationStatus.reverse;
    _report();
  }

  void _onLifecycle(AppLifecycleState state) {
    _foreground = _isForeground(state);
    _report();
  }

  void _report() {
    final visible = playbackVisible;
    final before = _reported;
    _reported = visible;
    if (before == null || before == visible || !mounted) return;
    didChangePlaybackVisibility(visible: visible);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(_hook);
    _routeAnimation?.removeStatusListener(_onRouteStatus);
    super.dispose();
  }
}

bool _isForeground(AppLifecycleState? s) =>
    s == null || s == AppLifecycleState.resumed;

class _LifecycleHook with WidgetsBindingObserver {
  _LifecycleHook(this.onChange);

  final ValueChanged<AppLifecycleState> onChange;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) => onChange(state);
}
