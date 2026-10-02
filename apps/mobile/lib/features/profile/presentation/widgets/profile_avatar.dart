import 'dart:typed_data';

import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Hero tag shared by every place an attorney's photo appears, so a list
/// row (search, file 05) → profile → editor flies the same avatar.
String attorneyAvatarHeroTag(String username) =>
    'attorney-avatar-${username.toLowerCase()}';

/// Profile photo: [preview] bytes (a photo being uploaded) → [url] → the
/// navy/gold initials seal. With [progress] a gold ring shows the upload.
class ProfileAvatar extends StatelessWidget {
  const ProfileAvatar({
    required this.size,
    super.key,
    this.url,
    this.preview,
    this.initials,
    this.heroTag,
    this.progress,
    this.semanticLabel,
  });

  final double size;
  final String? url;
  final Uint8List? preview;
  final String? initials;
  final String? heroTag;

  /// 0..1 while uploading; null hides the ring.
  final double? progress;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    // ignore: omit_local_variable_types
    final ImageProvider? image = preview != null
        ? MemoryImage(preview!)
        : (url != null && url!.isNotEmpty ? NetworkImage(url!) : null);

    Widget avatar = AppAvatar(
      imageProvider: image,
      initials: initials,
      size: size,
      semanticLabel: semanticLabel,
    );
    if (heroTag != null) avatar = Hero(tag: heroTag!, child: avatar);
    if (progress == null) return avatar;

    return Stack(
      alignment: Alignment.center,
      children: [
        avatar,
        SizedBox.square(
          dimension: size + AppSpacing.sm,
          child: TweenAnimationBuilder<double>(
            tween: Tween(end: progress!.clamp(0, 1)),
            duration:
                context.reduceMotion ? Duration.zero : AppMotion.stateChange,
            builder: (context, v, _) => CircularProgressIndicator(
              value: v == 0 ? null : v,
              strokeWidth: AppSizes.footerSpinnerStroke + 1,
              color: colors.gold,
              backgroundColor: colors.goldTint,
            ),
          ),
        ),
      ],
    );
  }
}

/// Blue check (docs/03 §6.3). Status blue from docs/01 §8.1 (`info`).
class VerifiedBadge extends StatelessWidget {
  const VerifiedBadge({
    required this.semanticLabel,
    super.key,
    this.size = AppSizes.iconSm,
    this.gold = false,
  });

  final String semanticLabel;
  final double size;

  /// Gold for a verified client, blue for an attorney (owner 2026-10-02).
  final bool gold;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      label: semanticLabel,
      excludeSemantics: true,
      child: AppIcon(
        AppIcons.verifiedRounded,
        size: size,
        color: gold ? colors.gold : colors.info,
      ),
    );
  }
}
