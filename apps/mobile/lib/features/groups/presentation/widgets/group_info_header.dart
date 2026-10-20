import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The top of «Group info»: the big photo (tap = full size; the edit badge
/// changes it), the title, the type, the member count, the description and
/// the creation date. Editing goes through the callbacks.
class GroupInfoHeader extends ConsumerWidget {
  const GroupInfoHeader({
    required this.detail,
    required this.onOpenPhoto,
    required this.onEditPhoto,
    required this.onEditTitle,
    required this.onEditDescription,
    this.photoBusy = false,
    super.key,
  });

  final api.GroupDetailDto detail;
  final VoidCallback onOpenPhoto;

  /// Null when the viewer may not change the photo.
  final VoidCallback? onEditPhoto;

  /// Null when the viewer may not edit the title / description.
  final VoidCallback? onEditTitle;
  final VoidCallback? onEditDescription;
  final bool photoBusy;

  static const double _photo = 112;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final photo = detail.avatarUrl;
    final description = detail.description?.trim() ?? '';
    final canEdit = onEditTitle != null;
    final kind = switch (detail.type) {
      api.GroupType.public => detail.username == null
          ? t.t('group.info.type.public')
          : atHandle(detail.username),
      api.GroupType.closed => t.t('group.info.type.closed'),
      _ => t.t('group.info.type.private'),
    };
    final kindIcon = switch (detail.type) {
      api.GroupType.public => AppIcons.publicRounded,
      api.GroupType.closed => AppIcons.linkRounded,
      _ => AppIcons.lockOutlineRounded,
    };

    return Column(
      children: [
        const SizedBox(height: AppSpacing.xl),
        Center(
          child: SizedBox(
            width: _photo,
            height: _photo,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Semantics(
                  button: detail.avatarFullUrl != null,
                  label: detail.title,
                  child: GestureDetector(
                    key: const ValueKey('group-info-avatar'),
                    onTap: detail.avatarFullUrl == null ? null : onOpenPhoto,
                    child: AppAvatar(
                      size: _photo,
                      initials: avatarInitials(detail.title),
                      imageProvider: photo == null
                          ? null
                          : appNetworkImage(photo, decodeWidthFor(_photo)),
                    ),
                  ),
                ),
                if (photoBusy)
                  Positioned.fill(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: colors.bg.withValues(alpha: 0.55),
                      ),
                      child: const Center(
                        child: SizedBox(
                          width: 28,
                          height: 28,
                          child: CircularProgressIndicator(strokeWidth: 2.5),
                        ),
                      ),
                    ),
                  ),
                if (onEditPhoto != null && !photoBusy)
                  PositionedDirectional(
                    end: -2,
                    bottom: -2,
                    child: Semantics(
                      button: true,
                      label: t.t('group.info.photoChange'),
                      excludeSemantics: true,
                      child: AppPressable(
                        onTap: onEditPhoto,
                        child: SizedBox(
                          width: AppSizes.touchTarget,
                          height: AppSizes.touchTarget,
                          child: Center(
                            child: Container(
                              key: const ValueKey('group-info-photo-edit'),
                              width: 34,
                              height: 34,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: colors.text,
                                border: Border.all(color: colors.bg, width: 2),
                              ),
                              child: AppIcon(
                                AppIcons.photoCameraOutlined,
                                size: 18,
                                color: colors.bg,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        Padding(
          padding:
              const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
          child: _Editable(
            onTap: onEditTitle,
            semanticLabel: t.t('group.info.editTitle'),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    detail.title,
                    key: const ValueKey('group-info-title'),
                    textAlign: TextAlign.center,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: type.titleLarge.copyWith(color: colors.text),
                  ),
                ),
                if (canEdit) ...[
                  const SizedBox(width: AppSpacing.sm),
                  AppIcon(
                    AppIcons.editOutlined,
                    size: 18,
                    color: colors.textSecondary,
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Padding(
          padding:
              const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
          child: Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: AppSpacing.md,
            runSpacing: AppSpacing.xs,
            children: [
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  AppIcon(kindIcon, size: 16, color: colors.goldDark),
                  const SizedBox(width: AppSpacing.xs),
                  Text(
                    kind,
                    key: const ValueKey('group-info-type'),
                    style: type.bodySmall.copyWith(
                      color: colors.goldDark,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
              Text(
                t.plural('group.info.members', detail.memberCount),
                key: const ValueKey('group-info-count'),
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        ),
        if (description.isNotEmpty || onEditDescription != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              AppSpacing.lg,
              AppSpacing.screenSide,
              0,
            ),
            child: _Editable(
              onTap: onEditDescription,
              semanticLabel: t.t('group.info.editDescription'),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Flexible(
                    child: Text(
                      description.isEmpty
                          ? t.t('group.info.addDescription')
                          : description,
                      key: const ValueKey('group-info-description'),
                      textAlign: TextAlign.center,
                      style: type.body.copyWith(
                        color:
                            description.isEmpty ? colors.goldDark : colors.text,
                      ),
                    ),
                  ),
                  if (onEditDescription != null && description.isNotEmpty) ...[
                    const SizedBox(width: AppSpacing.sm),
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: AppIcon(
                        AppIcons.editOutlined,
                        size: 16,
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        Padding(
          padding: const EdgeInsets.only(top: AppSpacing.md),
          child: Text(
            t.t('group.info.created', {'date': formats.date(detail.createdAt)}),
            key: const ValueKey('group-info-created'),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
        ),
      ],
    );
  }
}

/// Makes [child] a 44dp-high tap target when [onTap] is given.
class _Editable extends StatelessWidget {
  const _Editable({
    required this.child,
    required this.onTap,
    required this.semanticLabel,
  });

  final Widget child;
  final VoidCallback? onTap;
  final String semanticLabel;

  @override
  Widget build(BuildContext context) {
    if (onTap == null) return child;
    return Semantics(
      button: true,
      label: semanticLabel,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
          child: Center(child: child),
        ),
      ),
    );
  }
}
