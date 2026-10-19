import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/widgets/display/glass_panel.dart';

/// Owner 2026-10-19 («кнопки динамика и плей стилизуйте под наш стиль»):
/// the round button over a video — play / pause, sound on / off — in the
/// app's look: the theme's surface, a little see-through (blurred behind in
/// the Glass theme), a thin gold ring like the avatars and chips, the icon
/// in the theme's text colour. One look for every player (reels, the feed,
/// a chat video); [size] tells the big play from the small speaker.
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
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final circle = GlassPanel(
      radius: BorderRadius.circular(size / 2),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: colors.surface.withValues(alpha: 0.82),
          shape: BoxShape.circle,
          border: Border.all(
            color: colors.gold.withValues(alpha: 0.7),
            width: size >= 48 ? 1.5 : 1,
          ),
          boxShadow: [
            BoxShadow(color: colors.shadow, blurRadius: size / 4),
          ],
        ),
        alignment: Alignment.center,
        child: AppIcon(icon, size: size * 0.5, color: colors.text),
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
