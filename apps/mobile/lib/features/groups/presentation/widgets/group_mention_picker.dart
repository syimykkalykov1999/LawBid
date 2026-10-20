import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_style.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show GoldRingAvatar;
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The list of members that opens above the composer while typing «@».
class GroupMentionPicker extends StatelessWidget {
  const GroupMentionPicker({
    required this.members,
    required this.t,
    required this.onPick,
    super.key,
  });

  final List<api.GroupMemberDto> members;
  final Translator t;
  final void Function(api.GroupMemberDto member) onPick;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Material(
      color: colors.surface,
      child: Container(
        constraints: const BoxConstraints(maxHeight: 220),
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: colors.border)),
        ),
        child: ListView.builder(
          shrinkWrap: true,
          padding: EdgeInsets.zero,
          itemCount: members.length,
          itemBuilder: (context, i) {
            final m = members[i];
            final name = groupMemberName(t, m);
            final handle = m.username;
            return Semantics(
              button: true,
              label: name,
              excludeSemantics: true,
              child: AppPressable(
                onTap: () => onPick(m),
                child: ConstrainedBox(
                  constraints:
                      const BoxConstraints(minHeight: AppSizes.touchTarget),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.screenSide,
                      vertical: AppSpacing.xs,
                    ),
                    child: Row(
                      children: [
                        GoldRingAvatar(
                          url: m.avatarUrl,
                          initials: avatarInitials(name),
                          size: 32,
                          ring: m.verifiedBadge,
                        ),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.body.copyWith(color: colors.text),
                          ),
                        ),
                        if (handle != null && handle.isNotEmpty) ...[
                          const SizedBox(width: AppSpacing.sm),
                          Flexible(
                            child: Text(
                              '@$handle',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: type.bodySmall
                                  .copyWith(color: colors.textSecondary),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
