import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/application/invites_providers.dart';
import 'package:lawbid/features/cases/domain/case_invite.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';

/// Owner 2026-10-05: on the client's own case — the attorneys they
/// offered it to, where each invite stands, and Cancel while it waits.
/// Hidden when the case has no invites.
class CaseInvitesSection extends ConsumerWidget {
  const CaseInvitesSection({required this.caseId, super.key});

  final String caseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final items = ref.watch(caseInvitesProvider(caseId)).value;
    if (items == null || items.isEmpty) return const SizedBox.shrink();
    return DetailSection(
      key: const ValueKey('case-invites'),
      title: t.t('caseInvites.title'),
      child: Column(
        children: [
          for (final i in items)
            _InviteRow(key: ValueKey('case-invite-${i.id}'), invite: i),
        ],
      ),
    );
  }
}

class _InviteRow extends ConsumerStatefulWidget {
  const _InviteRow({required this.invite, super.key});

  final CaseInvite invite;

  @override
  ConsumerState<_InviteRow> createState() => _InviteRowState();
}

class _InviteRowState extends ConsumerState<_InviteRow> {
  bool _busy = false;

  Future<void> _cancel() async {
    final t = ref.read(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: colors.surface,
        title: Text(t.t('caseInvites.cancel.confirm')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            key: const ValueKey('case-invite-cancel-confirm'),
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(
              t.t('caseInvites.cancel'),
              style: TextStyle(color: colors.dangerText),
            ),
          ),
        ],
      ),
    );
    if (!(ok ?? false) || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(invitesRepositoryProvider).cancel(widget.invite.id);
      if (!mounted) return;
      showAppSnackBar(context, t.t('caseInvites.cancelled'));
      ref.invalidate(caseInvitesProvider(widget.invite.caseId));
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final i = widget.invite;
    final a = i.attorney;
    final name = a == null
        ? ''
        : [a.firstName, a.lastName]
            .whereType<String>()
            .where((s) => s.trim().isNotEmpty)
            .join(' ')
            .ifEmpty('@${a.username}');
    final reason = i.declineReason;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ProfileAvatar(
            size: 40,
            url: a?.avatarUrl,
            initials: name.isEmpty ? null : name.characters.first,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.body.copyWith(color: colors.text),
                ),
                const SizedBox(height: 2),
                Text(
                  t.t('caseInvites.status.${i.status.name}'),
                  key: ValueKey('case-invite-status-${i.id}'),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(
                    color: i.status == InviteStatus.accepted
                        ? colors.goldDark
                        : colors.textSecondary,
                  ),
                ),
                if (reason != null && reason.trim().isNotEmpty)
                  Text(
                    t.t('caseInvites.reason', {'reason': reason}),
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
              ],
            ),
          ),
          if (i.isPending)
            TextButton(
              key: ValueKey('case-invite-cancel-${i.id}'),
              onPressed: _busy ? null : _cancel,
              child: Text(
                t.t('caseInvites.cancel'),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
        ],
      ),
    );
  }
}

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}
