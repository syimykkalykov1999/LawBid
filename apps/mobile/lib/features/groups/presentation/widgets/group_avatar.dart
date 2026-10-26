import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';

/// A round avatar for a group or a person: the photo when there is one,
/// otherwise the initials of [name].
class GroupAvatar extends StatelessWidget {
  const GroupAvatar({
    required this.name,
    this.url,
    this.size = AppSizes.cardAvatar,
    super.key,
  });

  final String name;
  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    final trimmed = name.trim();
    return AppAvatar(
      size: size,
      initials: avatarInitials(trimmed.isEmpty ? '?' : trimmed),
      imageProvider:
          url == null ? null : appNetworkImage(url!, decodeWidthFor(size)),
    );
  }
}
