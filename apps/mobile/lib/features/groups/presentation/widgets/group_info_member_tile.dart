import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// One member row: avatar, name (+ verified mark), @username, a role badge
/// and, when the viewer may manage the person, a menu button. Long-press
/// opens the same menu.
class GroupInfoMemberTile extends ConsumerWidget {
  const GroupInfoMemberTile({
    required this.member,
    required this.isMe,
    required this.onOpen,
    required this.onMenu,
    super.key,
  });

  final api.GroupMemberDto member;
  final bool isMe;

  /// Opens the profile; null when the person has no public profile.
  final VoidCallback? onOpen;

  /// Opens the actions; null when there are none for this person.
  final VoidCallback? onMenu;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final username = member.username;
    final name = member.displayName ??
        (username == null ? t.t('group.someone') : atHandle(username));
    final avatar = member.avatarUrl;
    final role = switch (member.role) {
      api.GroupRole.owner => t.t('group.info.role.owner'),
      api.GroupRole.admin => t.t('group.info.role.admin'),
      _ => null,
    };
    final subtitle = isMe
        ? t.t('group.you')
        : (member.displayName != null && username != null)
            ? atHandle(username)
            : null;

    return Semantics(
      container: true,
      button: onOpen != null,
      label: [name, if (role != null) role, if (subtitle != null) subtitle]
          .join(', '),
      child: InkWell(
        onTap: onOpen,
        onLongPress: onMenu,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 60),
          child: Padding(
            padding: const EdgeInsetsDirectional.only(
              start: AppSpacing.md,
              end: AppSpacing.xs,
              top: AppSpacing.sm,
              bottom: AppSpacing.sm,
            ),
            child: Row(
              children: [
                AppAvatar(
                  initials: avatarInitials(name),
                  imageProvider: avatar == null
                      ? null
                      : appNetworkImage(
                          avatar,
                          decodeWidthFor(AppSizes.cardAvatar),
                        ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: type.body.copyWith(
                                color: colors.text,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          if (member.verifiedBadge) ...[
                            const SizedBox(width: AppSpacing.xs),
                            AppIcon(
                              AppIcons.verifiedRounded,
                              size: 16,
                              color: colors.goldAccent,
                            ),
                          ],
                        ],
                      ),
                      if (subtitle != null)
                        Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.caption.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                    ],
                  ),
                ),
                if (role != null) ...[
                  const SizedBox(width: AppSpacing.sm),
                  Flexible(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.sm,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: colors.goldTint,
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                        border: Border.all(
                          color: colors.goldStroke.withValues(alpha: 0.4),
                        ),
                      ),
                      child: Text(
                        role,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.caption.copyWith(
                          color: colors.goldDark,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
                ],
                if (onMenu != null)
                  AppIconButton(
                    icon: AppIcon(
                      AppIcons.moreVertRounded,
                      color: colors.textSecondary,
                    ),
                    semanticLabel: t.t('group.info.member.actions'),
                    onPressed: onMenu,
                  )
                else
                  const SizedBox(width: AppSpacing.sm),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
