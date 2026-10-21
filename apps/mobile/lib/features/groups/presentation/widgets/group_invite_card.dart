import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/groups/application/group_invite_actions.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_avatar.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The name of whoever sent the invitation.
String groupInviterName(String Function(String) t, api.GroupPersonDto p) {
  final username = p.username;
  return p.displayName ??
      (username == null ? t('group.someone') : atHandle(username));
}

/// Owner 2026-10-21 (as in Instagram): «X invites you to the group Y» with
/// «Accept» and «Decline». A tap on the card looks inside the group first.
class GroupInviteCard extends ConsumerStatefulWidget {
  const GroupInviteCard({required this.invite, super.key});

  final api.GroupInviteDto invite;

  @override
  ConsumerState<GroupInviteCard> createState() => _GroupInviteCardState();
}

class _GroupInviteCardState extends ConsumerState<GroupInviteCard> {
  bool? _accepting;

  Future<void> _answer(bool accept) async {
    if (_accepting != null) return;
    setState(() => _accepting = accept);
    final t = ref.read(translatorProvider);
    try {
      final joined = await answerGroupInvite(
        ref,
        widget.invite.id,
        accept: accept,
      );
      if (mounted && joined != null) {
        await context.push<void>(GroupRoutes.group(joined));
      }
    } on Object catch (e) {
      if (mounted) {
        setState(() => _accepting = null);
        showAppSnackBar(context, errorText(t, e));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final g = widget.invite;
    final who = groupInviterName(t.t, g.inviter);
    return Semantics(
      container: true,
      label: '${g.title}, ${t.t('group.inv.from', {'name': who})}',
      child: InkWell(
        key: ValueKey('group-invite-${g.id}'),
        onTap: () => context.push(GroupRoutes.invite(g.id)),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              GroupAvatar(name: g.title, url: g.avatarUrl, size: 54),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      g.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      t.t('group.inv.from', {'name': who}),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.bodySmall.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                    Text(
                      t.t(
                        'group.join.members',
                        {'count': context.digits(g.memberCount.toInt())},
                      ),
                      style: type.caption.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Row(
                      children: [
                        Expanded(
                          child: AppButton(
                            key: ValueKey('group-invite-accept-${g.id}'),
                            label: t.t('group.inv.accept'),
                            isLoading: _accepting ?? false,
                            isEnabled: _accepting == null,
                            onPressed: () => _answer(true),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: AppButton(
                            key: ValueKey('group-invite-decline-${g.id}'),
                            label: t.t('group.inv.decline'),
                            variant: AppButtonVariant.secondary,
                            isLoading: _accepting == false,
                            isEnabled: _accepting == null,
                            onPressed: () => _answer(false),
                          ),
                        ),
                      ],
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
