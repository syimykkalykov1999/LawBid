import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/subscription/subscription_routes.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/seat_limit_note.dart';
import 'package:lawbid/features/team/team_routes.dart';
import 'package:share_plus/share_plus.dart';

/// Owner 2026-10-04: an assistant joins — and signs in again on a new
/// phone — with a one-time code the attorney sends them. No SMS.
///
/// The seat's code with "Send" / "Copy" and "New code" (the old one stops
/// working; for a signed-in assistant the new phone replaces the old one).
class AssistantCodeCard extends ConsumerStatefulWidget {
  const AssistantCodeCard({required this.member, super.key});

  final TeamMember member;

  @override
  ConsumerState<AssistantCodeCard> createState() => _AssistantCodeCardState();
}

class _AssistantCodeCardState extends ConsumerState<AssistantCodeCard> {
  bool _busy = false;

  TeamMember get _m => widget.member;

  String _until() {
    final at = _m.joinCodeExpiresAt;
    return at == null ? '' : ref.read(l10nFormatsProvider).date(at);
  }

  Future<void> _copy() async {
    final t = ref.read(translatorProvider);
    await Clipboard.setData(ClipboardData(text: _m.joinCode!));
    if (mounted) showAppSnackBar(context, t.t('team.code.copied'));
  }

  Future<void> _send() async {
    final t = ref.read(translatorProvider);
    final box = context.findRenderObject() as RenderBox?;
    await SharePlus.instance.share(
      ShareParams(
        text: t.t('team.code.shareText', {
          'code': _m.joinCode!,
          'date': _until(),
        }),
        sharePositionOrigin:
            box == null ? null : box.localToGlobal(Offset.zero) & box.size,
      ),
    );
  }

  Future<void> _newCode() async {
    final t = ref.read(translatorProvider);
    if (_m.status == MemberStatus.active || _m.joinCode != null) {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          content: Text(
            t.t(
              _m.status == MemberStatus.active
                  ? 'team.code.newConfirmActive'
                  : 'team.code.newConfirm',
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: Text(t.t('common.cancel')),
            ),
            TextButton(
              key: const ValueKey('code-new-confirm'),
              onPressed: () => Navigator.of(ctx).pop(true),
              child: Text(t.t('team.code.new')),
            ),
          ],
        ),
      );
      if (!(ok ?? false) || !mounted) return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(teamProvider.notifier).newCode(_m.id);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final code = _m.joinCode;
    final newCode = TextButton.icon(
      key: ValueKey('code-new-${_m.id}'),
      onPressed: _busy ? null : _newCode,
      icon: const AppIcon(AppIcons.refreshRounded, size: AppSizes.iconSm),
      label: Text(
        t.t('team.code.new'),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
      ),
    );
    if (code == null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            t.t(
              _m.status == MemberStatus.active
                  ? 'team.code.signedIn'
                  : 'team.code.expired',
            ),
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
          newCode,
        ],
      );
    }
    return Container(
      key: ValueKey('code-card-${_m.id}'),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.field),
        border: Border.all(color: colors.goldStroke),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            t.t('team.code.title'),
            style: typography.bodySmall.copyWith(
              color: colors.text,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          // The code never wraps: it scales down on a narrow screen.
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: AlignmentDirectional.centerStart,
            child: SelectableText(
              code,
              key: ValueKey('code-text-${_m.id}'),
              style: typography.titleLarge.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w700,
                letterSpacing: 2,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
          Text(
            t.t('team.code.validUntil', {'date': _until()}),
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            t.t('team.code.body'),
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.md),
          // Stacked full-width buttons: nothing overlaps in long languages.
          AppButton(
            key: ValueKey('code-send-${_m.id}'),
            label: t.t('team.code.send'),
            icon: AppIcons.iosShareRounded,
            height: 44,
            onPressed: _send,
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            key: ValueKey('code-copy-${_m.id}'),
            label: t.t('team.code.copy'),
            icon: AppIcons.stickyNote2Outlined,
            variant: AppButtonVariant.secondary,
            height: 44,
            onPressed: _copy,
          ),
          Align(alignment: AlignmentDirectional.centerStart, child: newCode),
        ],
      ),
    );
  }
}

/// "Add assistant": an optional name, then the new seat's code at once.
/// Without a free seat it offers to add seats in Subscription.
Future<void> addAssistantWithCode(
  BuildContext context,
  WidgetRef ref,
  TeamInfo team,
) async {
  final t = ref.read(translatorProvider);
  if (!team.hasFreeSeat) {
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(t.t('team.noSeats')),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(t.t('team.buySeats')),
          ),
        ],
      ),
    );
    if ((go ?? false) && context.mounted) {
      await context.push(SubscriptionRoutes.subscription);
      ref.invalidate(teamProvider);
    }
    return;
  }
  final added = await showAppBottomSheet<TeamMember>(
    context: context,
    isScrollControlled: true,
    builder: (_) => const _AddSheet(),
  );
  if (added == null || !context.mounted) return;
  showAppSnackBar(context, t.t('team.add.done'));
  await showAppBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _NewCodeSheet(memberId: added.id),
  );
}

class _AddSheet extends ConsumerStatefulWidget {
  const _AddSheet();

  @override
  ConsumerState<_AddSheet> createState() => _AddSheetState();
}

class _AddSheetState extends ConsumerState<_AddSheet> {
  final _name = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      final name = _name.text.trim();
      final m = await ref
          .read(teamProvider.notifier)
          .add(name: name.isEmpty ? null : name);
      if (mounted) Navigator.of(context).pop(m);
    } on Object catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showAppSnackBar(context, errorText(t, e));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        0,
        AppSpacing.screenSide,
        AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            t.t('team.add'),
            style: typography.titleMedium.copyWith(color: colors.text),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('team.add.body'),
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            key: const ValueKey('team-add-name'),
            controller: _name,
            label: t.t('team.add.name'),
            textCapitalization: TextCapitalization.words,
            maxLength: 80,
            autofocus: true,
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            key: const ValueKey('team-add-save'),
            label: t.t('team.add'),
            isLoading: _busy,
            onPressed: _save,
          ),
        ],
      ),
    );
  }
}

/// The new seat's code right after "Add assistant" (live from the team).
class _NewCodeSheet extends ConsumerWidget {
  const _NewCodeSheet({required this.memberId});

  final String memberId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final m = ref
        .watch(teamProvider)
        .value
        ?.members
        .where((m) => m.id == memberId)
        .firstOrNull;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          0,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              m == null || m.label.isEmpty
                  ? t.t('team.member.unnamed')
                  : m.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.md),
            if (m != null) AssistantCodeCard(member: m),
          ],
        ),
      ),
    );
  }
}

/// Subscription → "Your assistants": every seat with its code, and "Add
/// assistant" while a seat is free (owner 2026-10-04: the code shows
/// right after a seat is bought, and stays here to copy again).
class AssistantSeatsSection extends ConsumerWidget {
  const AssistantSeatsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final team = ref.watch(teamProvider).value;
    if (team == null || team.seats == 0) return const SizedBox.shrink();
    final free = team.seats - team.used;
    return Column(
      key: const ValueKey('assistant-seats'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          t.t('team.section.title'),
          style: typography.titleMedium.copyWith(color: colors.text),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          t.t('team.section.free', {'count': '${free < 0 ? 0 : free}'}),
          style: typography.caption.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.md),
        for (final m in team.members) ...[
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  m.label.isEmpty ? t.t('team.member.unnamed') : m.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: typography.body.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                Text(
                  t.t(
                    m.status == MemberStatus.active
                        ? 'team.status.active'
                        : 'team.status.invited',
                  ),
                  style: typography.caption.copyWith(
                    color: m.status == MemberStatus.active
                        ? colors.success
                        : colors.gold,
                  ),
                ),
                const SizedBox(height: AppSpacing.sm),
                AssistantCodeCard(member: m),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
        ],
        if (team.hasFreeSeat)
          AppButton(
            key: const ValueKey('seats-add-assistant'),
            label: t.t('team.add'),
            icon: AppIcons.personAddAlt1Rounded,
            onPressed: () => addAssistantWithCode(context, ref, team),
          ),
        const SizedBox(height: AppSpacing.sm),
        const SeatLimitNote(),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton(
            onPressed: () => context.push(TeamRoutes.team),
            child: Text(
              t.t('team.section.manage'),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ),
      ],
    );
  }
}
