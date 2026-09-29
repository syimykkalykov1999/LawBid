import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/blocks/application/blocks_providers.dart';
import 'package:lawbid/features/blocks/data/blocks_repository.dart';
import 'package:lawbid/features/blocks/presentation/block_actions.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

/// Settings → "Blocked users" (owner 2026-09-29, OQ-028): everyone I
/// blocked, with Unblock.
class BlockedUsersScreen extends ConsumerWidget {
  const BlockedUsersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final list = ref.watch(blockedUsersProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('settings.blocked')),
      ),
      body: AsyncDetailBody<List<BlockedUser>>(
        value: list,
        t: t,
        onRetry: () => ref.invalidate(blockedUsersProvider),
        builder: (users) => users.isEmpty
            ? AppEmptyState(
                icon: Icons.block_flipped,
                message: t.t('blocked.empty'),
              )
            : ListView.builder(
                padding: EdgeInsets.only(
                  top: AppSpacing.sm,
                  bottom: AppSpacing.xxl + MediaQuery.paddingOf(context).bottom,
                ),
                itemCount: users.length,
                itemBuilder: (context, i) {
                  final u = users[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.screenSide,
                      vertical: AppSpacing.sm,
                    ),
                    child: Row(
                      children: [
                        GoldRingAvatar(
                          url: u.avatarUrl,
                          initials: u.displayName.isEmpty
                              ? '?'
                              : u.displayName.substring(0, 1).toUpperCase(),
                          size: 44,
                          ring: false,
                        ),
                        const SizedBox(width: AppSpacing.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                u.displayName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: type.body.copyWith(
                                  color: colors.text,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              if (u.username != null)
                                Text(
                                  '@${u.username}',
                                  style: type.caption
                                      .copyWith(color: colors.textSecondary),
                                ),
                            ],
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        AppButton(
                          label: t.t('block.unblock'),
                          variant: AppButtonVariant.secondary,
                          height: AppSizes.touchTarget - 4,
                          onPressed: () => toggleBlock(
                            context,
                            ref,
                            userId: u.id,
                            displayName: u.displayName,
                            currentlyBlocked: true,
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
      ),
    );
  }
}
