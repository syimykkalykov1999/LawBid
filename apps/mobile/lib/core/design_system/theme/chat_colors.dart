import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_colors.dart';

/// Owner 2026-10-17: chat colours like WhatsApp / Telegram, but in each
/// LawBid theme — my bubble is a calm shade of the theme (never the gold
/// button colour), the other side's is the surface, the background is a
/// soft wallpaper with a faint pattern, and read ticks are blue.
/// Access via `ChatColors.of(context)`.
@immutable
final class ChatColors extends ThemeExtension<ChatColors> {
  const ChatColors({
    required this.wallpaper,
    required this.pattern,
    required this.mine,
    required this.onMine,
    required this.mineMeta,
    required this.theirs,
    required this.theirsBorder,
    required this.onTheirs,
    required this.theirsMeta,
    required this.tick,
    required this.tickRead,
  });

  /// Picks the palette of the theme [c] belongs to.
  factory ChatColors.forTokens(AppColorTokens c, Brightness brightness) {
    if (c.bg == AppColorsGreen.bg) {
      return ChatColors(
        wallpaper: const Color(0xFFDDF0E4),
        pattern: AppColorsGreen.brand.withValues(alpha: 0.06),
        mine: const Color(0xFFBFEBD0),
        onMine: c.text,
        mineMeta: c.textSecondary,
        theirs: c.surface,
        theirsBorder: c.border,
        onTheirs: c.text,
        theirsMeta: c.textSecondary,
        tick: c.textSecondary,
        tickRead: const Color(0xFF2F80ED),
      );
    }
    if (c.bg == AppColorsBlue.bg) {
      return ChatColors(
        wallpaper: AppColorsBlue.chatWallpaper,
        pattern: c.accent.withValues(alpha: 0.05),
        mine: AppColorsBlue.chatMine,
        onMine: c.text,
        mineMeta: c.textSecondary,
        theirs: c.surface,
        theirsBorder: c.border,
        onTheirs: c.text,
        theirsMeta: c.textSecondary,
        tick: c.textSecondary,
        tickRead: const Color(0xFF2F80ED),
      );
    }
    if (brightness == Brightness.light) {
      return ChatColors(
        wallpaper: const Color(0xFFEEF1F6),
        pattern: c.accent.withValues(alpha: 0.05),
        mine: const Color(0xFFDCE6F8),
        onMine: c.text,
        mineMeta: c.textSecondary,
        theirs: c.surface,
        theirsBorder: c.border,
        onTheirs: c.text,
        theirsMeta: c.textSecondary,
        tick: c.textSecondary,
        tickRead: const Color(0xFF2F80ED),
      );
    }
    // Night: black with gold.
    return ChatColors(
      wallpaper: const Color(0xFF0D0D10),
      pattern: c.gold.withValues(alpha: 0.045),
      mine: const Color(0xFF2A2A33),
      onMine: c.text,
      mineMeta: c.text.withValues(alpha: 0.6),
      theirs: c.surface,
      theirsBorder: c.border,
      onTheirs: c.text,
      theirsMeta: c.textSecondary,
      tick: c.text.withValues(alpha: 0.6),
      tickRead: const Color(0xFF53BDEB),
    );
  }

  // ignore: prefer_constructors_over_static_methods
  static ChatColors of(BuildContext context) {
    final theme = Theme.of(context);
    return theme.extension<ChatColors>() ??
        ChatColors.forTokens(
          theme.extension<AppColorTokens>()!,
          theme.brightness,
        );
  }

  /// Owner 2026-10-17: the dark pill under the time on a photo / video,
  /// and its text.
  static const Color mediaScrim = Color(0x73000000);
  static const Color onMediaScrim = Color(0xFFFFFFFF);

  /// Owner 2026-10-22 (Instagram / WhatsApp): the soft shade rising from
  /// the bottom of a caption-less photo / video under its time and ticks.
  static const Color mediaFade = Color(0x00000000);

  /// Owner 2026-10-22: the full-screen media preview (before sending) is
  /// always dark, like WhatsApp's: black stage, white ink, a translucent
  /// bar, and a "nothing" colour for transparent surfaces.
  static const Color viewerBg = Color(0xFF000000);
  static const Color viewerBar = Color(0x99000000);
  static const Color onViewer = Color(0xFFFFFFFF);
  static const Color onViewerMuted = Color(0xB3FFFFFF);
  static const Color clear = Colors.transparent;

  final Color wallpaper;
  final Color pattern;
  final Color mine;
  final Color onMine;

  /// Time and ticks on my bubble.
  final Color mineMeta;
  final Color theirs;
  final Color theirsBorder;
  final Color onTheirs;
  final Color theirsMeta;

  /// Sent (one tick).
  final Color tick;

  /// Read (two ticks), WhatsApp blue.
  final Color tickRead;

  @override
  ChatColors copyWith({
    Color? wallpaper,
    Color? pattern,
    Color? mine,
    Color? onMine,
    Color? mineMeta,
    Color? theirs,
    Color? theirsBorder,
    Color? onTheirs,
    Color? theirsMeta,
    Color? tick,
    Color? tickRead,
  }) =>
      ChatColors(
        wallpaper: wallpaper ?? this.wallpaper,
        pattern: pattern ?? this.pattern,
        mine: mine ?? this.mine,
        onMine: onMine ?? this.onMine,
        mineMeta: mineMeta ?? this.mineMeta,
        theirs: theirs ?? this.theirs,
        theirsBorder: theirsBorder ?? this.theirsBorder,
        onTheirs: onTheirs ?? this.onTheirs,
        theirsMeta: theirsMeta ?? this.theirsMeta,
        tick: tick ?? this.tick,
        tickRead: tickRead ?? this.tickRead,
      );

  @override
  ChatColors lerp(covariant ChatColors? other, double t) {
    if (other == null) return this;
    Color l(Color a, Color b) => Color.lerp(a, b, t)!;
    return ChatColors(
      wallpaper: l(wallpaper, other.wallpaper),
      pattern: l(pattern, other.pattern),
      mine: l(mine, other.mine),
      onMine: l(onMine, other.onMine),
      mineMeta: l(mineMeta, other.mineMeta),
      theirs: l(theirs, other.theirs),
      theirsBorder: l(theirsBorder, other.theirsBorder),
      onTheirs: l(onTheirs, other.onTheirs),
      theirsMeta: l(theirsMeta, other.theirsMeta),
      tick: l(tick, other.tick),
      tickRead: l(tickRead, other.tickRead),
    );
  }
}
