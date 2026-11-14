import 'dart:ui' show lerpDouble;

import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner row 95 (motion catalog ME5, Instagram / Telegram): a story opens
/// zooming out of the avatar ring it was tapped on and shrinks back into
/// it when closed, instead of a page sliding in from the side.
///
/// Flutter's `Hero` (BSD-3) flies only a black frame — a rounded square
/// that grows from the ring to the full screen — while the story itself
/// fades in on the page fade; the player is never built twice. The tag is
/// unique per ring on screen ([StoryHero.tagFor]), so two rings of the same
/// person never share one.
class StoryHero extends StatelessWidget {
  const StoryHero({required this.tag, required this.child, super.key});

  /// One tag per ring element (the tray and a profile can both show one).
  static String tagFor(BuildContext ring, String userId) =>
      'story-hero-$userId-${identityHashCode(ring)}';

  final String tag;
  final Widget child;

  /// The flying frame: black, its corners going from a circle to square.
  static Widget _shuttle(
    BuildContext context,
    Animation<double> animation,
    HeroFlightDirection direction,
    BuildContext from,
    BuildContext to,
  ) {
    final ringBox = (direction == HeroFlightDirection.push ? from : to)
        .findRenderObject() as RenderBox?;
    final start = ringBox?.size.shortestSide ?? 64;
    return AnimatedBuilder(
      animation: animation,
      builder: (context, _) => ClipRRect(
        borderRadius: BorderRadius.circular(
          lerpDouble(start / 2, 0, animation.value) ?? 0,
        ),
        child: const ColoredBox(color: AppOverlayColors.storyBackdrop),
      ),
    );
  }

  @override
  Widget build(BuildContext context) => HeroMode(
        enabled: !context.reduceMotion,
        child: Hero(
          tag: tag,
          flightShuttleBuilder: _shuttle,
          // A straight path (the photo viewer's), not Material's arc.
          createRectTween: (a, b) => RectTween(begin: a, end: b),
          child: child,
        ),
      );
}
