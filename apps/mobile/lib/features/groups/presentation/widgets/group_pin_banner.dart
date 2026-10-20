import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/groups/presentation/group_message_text.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The pinned message under the header: a tap jumps to it, an admin can
/// unpin it with the close button.
class GroupPinBanner extends StatelessWidget {
  const GroupPinBanner({
    required this.message,
    required this.t,
    required this.onTap,
    this.onUnpin,
    super.key,
  });

  final api.GroupMessageDto message;
  final Translator t;
  final VoidCallback onTap;

  /// Null for people who cannot pin.
  final VoidCallback? onUnpin;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final preview = groupMessagePreview(t, message, withSender: true);
    return Material(
      color: colors.surface,
      child: Container(
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: colors.border)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Semantics(
                button: true,
                label: '${t.t('group.conv.pinned')}: $preview',
                excludeSemantics: true,
                child: AppPressable(
                  onTap: onTap,
                  child: ConstrainedBox(
                    constraints:
                        const BoxConstraints(minHeight: AppSizes.touchTarget),
                    child: Padding(
                      padding: const EdgeInsetsDirectional.only(
                        start: AppSpacing.screenSide,
                        top: AppSpacing.xs,
                        bottom: AppSpacing.xs,
                      ),
                      child: Row(
                        children: [
                          AppIcon(
                            AppIcons.pushPin,
                            size: 18,
                            color: colors.goldDark,
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Container(
                            width: 2,
                            height: 30,
                            color: colors.goldDark,
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  t.t('group.conv.pinned'),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: type.caption.copyWith(
                                    color: colors.goldDark,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                Text(
                                  preview,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: type.bodySmall
                                      .copyWith(color: colors.text),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
            if (onUnpin != null)
              AppIconButton(
                icon: AppIcon(
                  AppIcons.closeRounded,
                  size: 20,
                  color: colors.textSecondary,
                ),
                semanticLabel: t.t('group.conv.unpin'),
                onPressed: onUnpin,
              )
            else
              const SizedBox(width: AppSpacing.screenSide),
          ],
        ),
      ),
    );
  }
}
