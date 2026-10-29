import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';

/// Keeps every screen above the Android system navigation bar.
///
/// Owner 2026-10-05: on a real Android phone (3-button and gesture
/// navigation) pinned buttons such as «Поставить задачу» sat under the
/// system bar and were hard to tap. Android 15+ forces edge-to-edge, and
/// any scroll view or bottom bar with its own padding ignores the inset,
/// so instead of fixing ~80 screens one by one the app reserves the
/// navigation-bar strip once, here, and paints it in the page colour (the
/// classic opaque Android navigation bar). Screens, bottom sheets and
/// dialogs below see a zero bottom inset, so existing `SafeArea`s add no
/// double gap.
///
/// iOS keeps edge-to-edge: content scrolls under the home indicator and
/// the existing `SafeArea`s lift pinned buttons above it.
///
/// Full-bleed dark screens (reels, calls, photo viewer) paint the strip in
/// their own colour with [SystemNavBandColor].
class SystemNavBand extends StatefulWidget {
  const SystemNavBand({required this.child, super.key});

  final Widget child;

  /// Colours requested by the [SystemNavBandColor]s currently mounted; the
  /// last one wins.
  static final ValueNotifier<List<Color>> _overrides =
      ValueNotifier<List<Color>>(const []);

  /// Owner bug 2026-10-28 (Samsung): after a search field (Chats) or a
  /// code field (История кейсов) was closed, the phone kept reporting the
  /// keyboard height — every screen stayed squashed into the top half, the
  /// «+» floated mid-screen, the reels had black space below, across all
  /// tabs. A keyboard can only be up for a focused field (a text field or
  /// a platform view such as a web page): with no focused leaf at all, a
  /// non-zero bottom inset is stale and is ignored here, once, for the
  /// whole app. Upstream: flutter/flutter#191156 («[Android]
  /// viewInsets.bottom is restored to the keyboard height … while no
  /// TextField is focused», open in Flutter 3.44–3.47); only public
  /// framework API is used (FocusManager.primaryFocus + MediaQuery).
  @visibleForTesting
  static bool keyboardCanBeOpen() {
    final focus = FocusManager.instance.primaryFocus;
    return focus != null && focus is! FocusScopeNode;
  }

  @override
  State<SystemNavBand> createState() => _SystemNavBandState();
}

class _SystemNavBandState extends State<SystemNavBand> {
  bool _keyboardCanBeOpen = SystemNavBand.keyboardCanBeOpen();

  @override
  void initState() {
    super.initState();
    FocusManager.instance.addListener(_focusChanged);
  }

  @override
  void dispose() {
    FocusManager.instance.removeListener(_focusChanged);
    super.dispose();
  }

  void _focusChanged() {
    final next = SystemNavBand.keyboardCanBeOpen();
    if (next == _keyboardCanBeOpen || !mounted) return;
    // Focus changes can arrive mid-frame (a field disposed while focused).
    if (SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      SchedulerBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          setState(
            () => _keyboardCanBeOpen = SystemNavBand.keyboardCanBeOpen(),
          );
        }
      });
    } else {
      setState(() => _keyboardCanBeOpen = next);
    }
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    final android = defaultTargetPlatform == TargetPlatform.android;
    // viewPadding stays the same while the keyboard is open, so the strip
    // never jumps.
    final band = android ? media.viewPadding.bottom : 0.0;
    final keyboard = _keyboardCanBeOpen ? media.viewInsets.bottom : 0.0;
    final inner = band == 0 && keyboard == media.viewInsets.bottom
        ? media
        : media.copyWith(
            padding: band == 0 ? null : media.padding.copyWith(bottom: 0),
            viewPadding:
                band == 0 ? null : media.viewPadding.copyWith(bottom: 0),
            // The keyboard covers the strip too: only what rises above it
            // still pushes the screen up.
            viewInsets: media.viewInsets.copyWith(
              bottom: math.max(0, keyboard - band),
            ),
          );
    final tokens = Theme.of(context).extension<AppColorTokens>();
    final pageColor = tokens == null ? Colors.white : tokens.bg;
    // Same widget shape for every inset (rotation, nav mode switch) so the
    // app below never loses its state.
    return Column(
      children: [
        Expanded(child: MediaQuery(data: inner, child: widget.child)),
        _Strip(height: band, pageColor: pageColor),
      ],
    );
  }
}

class _Strip extends StatefulWidget {
  const _Strip({required this.height, required this.pageColor});

  final double height;
  final Color pageColor;

  @override
  State<_Strip> createState() => _StripState();
}

class _StripState extends State<_Strip> {
  @override
  void initState() {
    super.initState();
    SystemNavBand._overrides.addListener(_changed);
  }

  @override
  void dispose() {
    SystemNavBand._overrides.removeListener(_changed);
    super.dispose();
  }

  // Overrides change from initState/dispose of pages being built, so the
  // repaint waits for the end of the current frame.
  void _changed() {
    if (SchedulerBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      SchedulerBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() {});
      });
    } else {
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final overrides = SystemNavBand._overrides.value;
    final color = overrides.isEmpty ? widget.pageColor : overrides.last;
    final dark = ThemeData.estimateBrightnessForColor(color) == Brightness.dark;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        systemNavigationBarColor: color,
        systemNavigationBarDividerColor: color,
        systemNavigationBarIconBrightness:
            dark ? Brightness.light : Brightness.dark,
        systemNavigationBarContrastEnforced: false,
      ),
      child: ColoredBox(
        color: color,
        child: SizedBox(height: widget.height, width: double.infinity),
      ),
    );
  }
}

/// Paints the [SystemNavBand] strip in [color] while this widget is
/// mounted (dark full-screen pages, so the strip doesn't flash light).
class SystemNavBandColor extends StatefulWidget {
  const SystemNavBandColor({
    required this.color,
    required this.child,
    super.key,
  });

  final Color color;
  final Widget child;

  @override
  State<SystemNavBandColor> createState() => _SystemNavBandColorState();
}

class _SystemNavBandColorState extends State<SystemNavBandColor> {
  late Color _pushed;

  @override
  void initState() {
    super.initState();
    _push(widget.color);
  }

  @override
  void didUpdateWidget(SystemNavBandColor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.color != widget.color) {
      _pop();
      _push(widget.color);
    }
  }

  @override
  void dispose() {
    _pop();
    super.dispose();
  }

  void _push(Color color) {
    _pushed = color;
    SystemNavBand._overrides.value = [
      ...SystemNavBand._overrides.value,
      color,
    ];
  }

  void _pop() {
    final list = [...SystemNavBand._overrides.value];
    final i = list.lastIndexOf(_pushed);
    if (i >= 0) list.removeAt(i);
    SystemNavBand._overrides.value = list;
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
