import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/tokens/app_media_overlay.dart';

/// Owner 2026-10-19 («кнопки динамика и плей стилизуйте под наш стиль»):
/// the round button over a video — play / pause, sound on / off. One look for
/// every player (reels, the feed, a chat video); [size] tells the big play
/// from the small speaker.
///
/// Owner 2026-10-28: it sits on a picture, not on the page, so it uses the
/// fixed [AppMediaOverlay] colours (dark glass, white ring and glyph) in every
/// theme instead of the theme's surface and text.
class PlayerRoundButton extends StatelessWidget {
  const PlayerRoundButton({
    required this.icon,
    this.size = 56,
    this.onTap,
    this.semanticLabel,
    super.key,
  });

  final IconData icon;
  final double size;
  final VoidCallback? onTap;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final circle = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: AppMediaOverlay.controlFill,
        shape: BoxShape.circle,
        border: Border.all(
          color: AppMediaOverlay.controlRing,
          width: size >= 48 ? 1.5 : 1,
        ),
        boxShadow: [
          BoxShadow(color: AppMediaOverlay.scrim, blurRadius: size / 4),
        ],
      ),
      alignment: Alignment.center,
      child: AppIcon(
        icon,
        size: size * 0.5,
        color: AppMediaOverlay.ink,
      ),
    );
    final button = onTap == null
        ? circle
        : GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onTap,
            // A 44 dp tap target around a small button.
            child: Padding(
              padding: EdgeInsets.all(size < 44 ? (44 - size) / 2 : 0),
              child: circle,
            ),
          );
    return Semantics(
      button: onTap != null,
      label: semanticLabel,
      excludeSemantics: semanticLabel != null,
      child: button,
    );
  }
}
