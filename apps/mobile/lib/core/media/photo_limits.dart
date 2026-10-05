import 'package:lawbid/core/feature_flags/feature_flags_state.dart';

/// Owner 2026-10-05: photos are shrunk on the phone before upload — small
/// files, no visible loss. The admin tunes it (Система → Настройки):
/// `media.photo_max_px` (longest side) and `media.photo_quality` (JPEG) for
/// posts, reels, cases and reviews; `media.avatar_max_px` for profile
/// photos. Values are kept within sane bounds.
typedef PhotoLimits = ({double maxPx, int quality});

PhotoLimits photoLimitsOf(FeatureFlagsState flags) => (
      maxPx: flags
          .configInt('media.photo_max_px', 2048)
          .clamp(640, 4096)
          .toDouble(),
      quality: flags.configInt('media.photo_quality', 85).clamp(50, 100),
    );

PhotoLimits avatarLimitsOf(FeatureFlagsState flags) => (
      maxPx: flags
          .configInt('media.avatar_max_px', 1024)
          .clamp(256, 2048)
          .toDouble(),
      quality: flags.configInt('media.photo_quality', 85).clamp(50, 100),
    );
