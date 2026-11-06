import 'dart:typed_data';

import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';

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
    this.fullUrl,
    this.preview,
    this.initials,
    this.heroTag,
    this.progress,
    this.semanticLabel,
    this.viewerCloseLabel,
  });

  /// Owner 2026-10-07: set → a tap opens the photo full screen (zoom,
  /// double tap, swipe down to close); this is its close button label.
  final String? viewerCloseLabel;

  final double size;
  final String? url;

  /// Owner 2026-11-04 (R-405): the 1024 px picture when the server sent one
  /// apart from the preview (`avatarFullUrl`). Drawn instead of [url] once
  /// the circle needs more than 256 px ([avatarUrlFor]) and opened full
  /// screen; without it the preview's own full picture is derived.
  final String? fullUrl;
  final Uint8List? preview;
  final String? initials;
  final String? heroTag;

  /// 0..1 while uploading; null hides the ring.
  final double? progress;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final link = url;
    // AppAvatar decodes at the drawn size × pixel ratio itself, so the
    // provider is handed over unresized.
    // ignore: omit_local_variable_types
    final ImageProvider? image = preview != null
        ? MemoryImage(preview!)
        : (link != null && link.isNotEmpty
            ? stableNetworkImage(
                avatarUrlFor(
                  link,
                  logicalSize: size,
                  devicePixelRatio: MediaQuery.devicePixelRatioOf(context),
                  fullUrl: fullUrl,
                ),
                fallbackUrls: [link],
              )
            : null);

    Widget avatar = AppAvatar(
      imageProvider: image,
      initials: initials,
      size: size,
      semanticLabel: semanticLabel,
    );
    if (heroTag != null) avatar = Hero(tag: heroTag!, child: avatar);
    final photo = url;
    if (viewerCloseLabel != null &&
        preview == null &&
        photo != null &&
        photo.isNotEmpty) {
      avatar = GestureDetector(
        key: const ValueKey('avatar-open'),
        behavior: HitTestBehavior.opaque,
        // The full picture, the preview already on screen as its placeholder
        // (never a 256 px picture stretched over the whole screen).
        onTap: () => showPhotoGallery(
          context,
          urls: [avatarFullUrlFor(photo, fullUrl: fullUrl)],
          previews: [photo],
          closeLabel: viewerCloseLabel!,
        ),
        child: avatar,
      );
    }
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
