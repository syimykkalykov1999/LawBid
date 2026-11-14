import 'package:lawbid/core/config/client_tuning.dart';
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
      quality: flags.configInt('media.photo_quality', 90).clamp(50, 100),
    );

PhotoLimits avatarLimitsOf(FeatureFlagsState flags) => (
      maxPx: flags
          .configInt('media.avatar_max_px', 1024)
          .clamp(256, 2048)
          .toDouble(),
      // Owner 2026-10-19: the profile photo's own quality (default 95).
      quality: flags
          .configInt(
            'media.avatar_quality',
            flags.configInt('media.photo_quality', 95),
          )
          .clamp(50, 100),
    );

/// Owner 2026-10-22 (client economy plan, package I): the longest side and
/// the JPEG quality of a photo sent in a chat (HD stays a choice for later).
const kChatPhotoMaxPx = 1600.0;
const kChatPhotoQuality = 82;

/// Media audit 13.11 (C7): a verification document (ID, bar card) picked
/// from «Files»: the admin's `client.verification_photo_max_px` (2048) and
/// `client.verification_photo_quality` (90).
PhotoLimits verificationPhotoLimits() => (
      maxPx: ClientTuning.verificationPhotoMaxPx,
      quality: ClientTuning.verificationPhotoQuality,
    );

/// The chat photo size as [PhotoLimits] (a picture sent through «Files» is
/// shrunk the same way as one from the gallery, audit C7).
PhotoLimits chatPhotoLimits() => (
      maxPx: ClientTuning.chatPhotoMaxPx,
      quality: ClientTuning.chatPhotoQuality,
    );
