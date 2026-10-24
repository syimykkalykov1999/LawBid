import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';

/// Owner 2026-10-23: THE floating action button of the app - the «+» of
/// Chats (new chat), Tasks (new task) and Q&A (ask a question), and the call
/// button above Chats' «+». One component so they share shape, size, colours
/// and place.
///
/// [semanticLabel] is read by screen readers and shown as the long-press
/// tooltip. [liftOverInset] is for a screen that sits at the bottom of the
/// window while its shell has removed the bottom inset (Chats, the feed's
/// last page): see [appFabLift]. A screen that already sits above the bottom
/// navigation (Tasks, Q&A) leaves it off.
class AppFab extends StatelessWidget {
  const AppFab({
    required this.semanticLabel,
    required this.onPressed,
    this.icon = AppIcons.addRounded,
    this.background,
    this.foreground,
    this.liveDot = false,
    this.liftOverInset = false,
    this.buttonKey,
    this.liftKey,
    this.iconKey,
    super.key,
  });

  final String semanticLabel;
  final VoidCallback onPressed;
  final IconData icon;

  /// Default: the accent. A call going on uses the success colour.
  final Color? background;
  final Color? foreground;

  /// A small blinking green dot on the corner ("a call is live"). Steady
  /// when the phone asks for reduced motion.
  final bool liveDot;
  final bool liftOverInset;
  final Key? buttonKey;
  final Key? liftKey;
  final Key? iconKey;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final lift = liftOverInset ? appFabLift(context) : 0.0;
    Widget button = FloatingActionButton(
      key: buttonKey,
      heroTag: null,
      tooltip: semanticLabel,
      backgroundColor: background ?? colors.accent,
      foregroundColor: foreground ?? colors.onAccent,
      onPressed: onPressed,
      child: AppIcon(icon, key: iconKey),
    );
    if (liveDot) {
      button = Stack(
        clipBehavior: Clip.none,
        children: [
          button,
          const PositionedDirectional(
            top: -2,
            end: -2,
            child: IgnorePointer(child: AppLiveDot()),
          ),
        ],
      );
    }
    return Semantics(
      button: true,
      label: semanticLabel,
      excludeSemantics: true,
      child: Padding(
        key: liftKey,
        padding: EdgeInsets.only(bottom: lift),
        child: button,
      ),
    );
  }
}

/// How far a bottom-of-window FAB is lifted above where its Scaffold puts it
/// (16 dp above the content's bottom edge).
///
/// The app shell strips the bottom inset from its pages, so the Scaffold
/// no longer knows the home indicator / navigation bar is there; the DEVICE's
/// inset is read from the view.
///  - iPhone: lifted by that inset plus [AppSpacing.sm] (owner 2026-10-23:
///    it sat on the home indicator).
///  - Android with gesture navigation (the thin handle, up to about 32 dp):
///    not lifted at all - the standard 16 dp gap, like WhatsApp (owner
///    2026-10-23: it sat too high with inset + 8).
///  - Android with the 3-button bar (taller): lifted by the bar's height so
///    the button is not under it.
double appFabLift(BuildContext context) {
  final view = View.of(context);
  final device = view.viewPadding.bottom / view.devicePixelRatio;
  final lost = (device - MediaQuery.viewPaddingOf(context).bottom)
      .clamp(0.0, double.infinity);
  return switch (Theme.of(context).platform) {
    TargetPlatform.iOS || TargetPlatform.macOS => lost + AppSpacing.sm,
    _ => lost > kGestureBarMax ? lost : 0.0,
  };
}

/// The tallest bottom inset that is still a gesture-navigation handle on
/// Android (Samsung / Pixel: 16-24 dp); the 3-button bar is 48 dp.
const double kGestureBarMax = 32;

/// The small green dot of a running call. It blinks (a soft pulse) unless the
/// phone asks for reduced motion; then it is steady.
class AppLiveDot extends StatefulWidget {
  const AppLiveDot({super.key});

  @override
  State<AppLiveDot> createState() => _AppLiveDotState();
}

class _AppLiveDotState extends State<AppLiveDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (context.reduceMotion) {
      _c
        ..stop()
        ..value = 1;
    } else if (!_c.isAnimating) {
      unawaited(_c.repeat(reverse: true));
    }
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return FadeTransition(
      key: const ValueKey('live-dot'),
      opacity: Tween<double>(begin: 0.35, end: 1).animate(_c),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.success,
          shape: BoxShape.circle,
          border: Border.all(color: colors.bg, width: 2),
        ),
        child: const SizedBox.square(dimension: 14),
      ),
    );
  }
}
