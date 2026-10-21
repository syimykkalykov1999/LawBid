import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_avatar.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-21: public groups matching the typed words in the Channels
/// search (short words ask nothing; a failing search shows no groups).
final groupSearchProvider = FutureProvider.autoDispose
    .family<List<api.GroupInvitePreviewDto>, String>((ref, q) async {
  if (q.trim().length < 2) return const [];
  try {
    return await ref.watch(groupRepositoryProvider).searchPublic(q.trim());
  } on Object {
    return const [];
  }
});

/// A section caption of the Channels lists («Channels» / «Groups»).
class SectionCaption extends StatelessWidget {
  const SectionCaption(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.xs,
      ),
      child: Text(
        text,
        style: type.caption.copyWith(
          color: colors.textSecondary,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// A group I am not in (Discover, search): tap opens it (or its invite);
/// a long press offers «Join» and «Open».
class GroupPreviewRow extends ConsumerWidget {
  const GroupPreviewRow({required this.group, super.key});

  final api.GroupInvitePreviewDto group;

  void _open(BuildContext context) => context.push(
        group.alreadyMember
            ? GroupRoutes.group(group.id)
            : GroupRoutes.join(group.code),
      );

  Future<void> _menu(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    final pick = await showAppBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: AppSpacing.sm),
            const AppSheetHandle(),
            if (!group.alreadyMember)
              AppListRow(
                key: const ValueKey('group-preview-join'),
                icon: AppIcons.groupAddOutlined,
                label: t.t('group.find.join'),
                showChevron: false,
                onTap: () => Navigator.of(ctx).pop('join'),
              ),
            AppListRow(
              key: const ValueKey('group-preview-open'),
              icon: AppIcons.openInNewRounded,
              label: t.t('group.find.open'),
              showChevron: false,
              onTap: () => Navigator.of(ctx).pop('open'),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
    if (pick == null || !context.mounted) return;
    if (pick == 'open') return _open(context);
    try {
      final r = await ref.read(groupRepositoryProvider).join(group.code);
      ref
        ..invalidate(groupsProvider)
        ..invalidate(recommendedGroupsProvider);
      if (!context.mounted) return;
      if (r.status == api.GroupJoinResultDtoStatus.joined) {
        unawaited(context.push(GroupRoutes.group(r.groupId)));
      } else {
        showAppSnackBar(context, t.t('group.join.requested'));
      }
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final username = group.username;
    return InkWell(
      onTap: () => _open(context),
      // Owner 2026-10-21 (inbox 22d): Discover — join or open.
      onLongPress: () => _menu(context, ref),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            children: [
              GroupAvatar(name: group.title, url: group.avatarUrl, size: 48),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      group.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      [
                        if (username != null) '@$username',
                        t.t('group.find.members', {
                          'count': context.digits(group.memberCount.toInt()),
                        }),
                      ].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
