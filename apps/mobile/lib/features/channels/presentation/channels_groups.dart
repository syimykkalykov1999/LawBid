import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
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

/// A group I am not in (Discover, search): tap opens it (or its invite).
class GroupPreviewRow extends ConsumerWidget {
  const GroupPreviewRow({required this.group, super.key});

  final api.GroupInvitePreviewDto group;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final username = group.username;
    return InkWell(
      onTap: () => context.push(
        group.alreadyMember
            ? GroupRoutes.group(group.id)
            : GroupRoutes.join(group.code),
      ),
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
