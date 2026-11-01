import 'package:flutter/widgets.dart';
import 'package:lawbid/core/design_system/tokens/app_colors.dart';

/// Fixed colours for everything drawn OVER photos and videos (reels rail,
/// story and post viewers, video player controls, media overlays in chat).
///
/// Owner 2026-10-28 (phone test, Green theme): the reel's action rail looked
/// washed out because it took the app theme's `danger` / `success` / `gold`
/// (pale pink, pale green...) — those are tuned for the theme's own page,
/// not for an arbitrary video. A picture does not change with the theme, so
/// neither do these: they never read the theme.
abstract final class AppMediaOverlay {
  /// Icons and text: pure white.
  static const Color ink = Color(0xFFFFFFFF);

  /// Secondary text on media (captions, hints): 90 % white, still >= 4.5:1
  /// on the bottom scrim.
  static const Color inkMuted = Color(0xE6FFFFFF);

  /// Liked heart: the default theme's liked colour, a vivid red in every
  /// theme.
  static const Color liked = AppColorsStatus.danger;

  /// Reposted: a bright green (the default `success`, lifted for video).
  static const Color reposted = Color(0xFF34C98A);

  /// Saved / bookmark / active star: bright gold.
  static const Color saved = Color(0xFFFFC629);

  /// The gold verified check over a photo / video.
  static const Color verified = Color(0xFFFFC629);

  /// An error glyph over media (failed upload, retry).
  static const Color error = Color(0xFFFF5A5A);

  /// Spinner on a video.
  static const Color progress = ink;

  /// Dark veil under the controls and captions.
  static const Color scrim = Color(0x73000000);

  /// Fill of a round control (play, sound) over media.
  static const Color controlFill = Color(0x8C000000);

  /// Ring of a round control.
  static const Color controlRing = Color(0xB3FFFFFF);

  /// Fill of a pill button over media (Follow, More).
  static const Color pillFill = Color(0x73000000);

  /// Pill fill once it is active (followed).
  static const Color pillFillActive = Color(0x40FFFFFF);

  /// Pill outline.
  static const Color pillRing = Color(0xCCFFFFFF);

  /// Subtle shadow that keeps white readable on a bright frame.
  static const List<Shadow> shadows = [
    Shadow(blurRadius: 8, color: Color(0x99000000)),
    Shadow(blurRadius: 2, color: Color(0x66000000)),
  ];
}
