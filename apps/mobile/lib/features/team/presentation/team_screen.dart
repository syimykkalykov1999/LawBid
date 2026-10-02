import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/subscription/presentation/plan_picker.dart'
    show phoneE164;
import 'package:lawbid/features/subscription/subscription_routes.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/team_widgets.dart';

/// OQ-048 (owner 2026-09-30) — Team: the attorney's assistants, seats,
/// and who does what (one duty to many, many to one). Adding a phone lets
/// that assistant join without a code; removing ends access at once.
class TeamScreen extends ConsumerWidget {
  const TeamScreen({super.key});

  Future<void> _add(BuildContext context, WidgetRef ref, TeamInfo team) async {
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
    final added = await showAppBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _AddSheet(),
    );
    if ((added ?? false) && context.mounted) {
      showAppSnackBar(context, t.t('team.add.done'));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final team = ref.watch(teamProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('team.title')),
      ),
      body: AsyncDetailBody<TeamInfo>(
        value: team,
        t: t,
        onRetry: () => ref.invalidate(teamProvider),
        builder: (info) => RefreshIndicator(
          color: colors.gold,
          backgroundColor: colors.surface,
          onRefresh: () => ref.read(teamProvider.notifier).refresh(),
          child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              AppSpacing.lg,
              AppSpacing.screenSide,
              AppSpacing.xxl,
            ),
            children: [
              _SeatsCard(info: info, t: t),
              const SizedBox(height: AppSpacing.lg),
              if (info.members.isEmpty)
                SizedBox(
                  height: 300,
                  child: AppEmptyState(
                    icon: AppIcons.groups2Outlined,
                    title: t.t('team.empty'),
                    message: t.t('team.empty.body'),
                  ),
                )
              else
                for (final (i, m) in info.members.indexed)
                  AppEntrance(
                    index: i,
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                      child: _MemberTile(
                        member: m,
                        t: t,
                        onTap: () => showAppBottomSheet<void>(
                          context: context,
                          isScrollControlled: true,
                          builder: (_) => _MemberSheet(member: m),
                        ),
                      ),
                    ),
                  ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                key: const ValueKey('team-add'),
                label: t.t('team.add'),
                icon: AppIcons.personAddAlt1Rounded,
                onPressed: () => _add(context, ref, info),
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                t.t('plans.phones.hint'),
                textAlign: TextAlign.center,
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SeatsCard extends StatelessWidget {
  const _SeatsCard({required this.info, required this.t});

  final TeamInfo info;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final max = info.seats == 0 ? 1 : info.seats;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: AppColorsFixed.attorneyCardNavy,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: AppColorsFixed.attorneyCardGoldBorder),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const AppIcon(
                AppIcons.groups2Rounded,
                color: AppColorsLight.gold,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  t.t('team.seats', {
                    'used': '${info.used}',
                    'seats': '${info.seats}',
                  }),
                  style: typography.titleMedium.copyWith(
                    color: AppColorsFixed.attorneyCardTitleText,
                  ),
                ),
              ),
              Text(
                info.plan == 'yearly'
                    ? t.t('plans.yearly')
                    : info.plan == 'monthly'
                        ? t.t('plans.monthly')
                        : '',
                style: typography.caption.copyWith(color: AppColorsLight.gold),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.pill),
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: (info.used / max).clamp(0, 1)),
              duration: context.reduceMotion
                  ? Duration.zero
                  : const Duration(milliseconds: 600),
              curve: Curves.easeOutCubic,
              builder: (_, v, __) => LinearProgressIndicator(
                value: v,
                minHeight: 6,
                backgroundColor: AppColorsFixed.attorneyCardGoldBorder
                    .withValues(alpha: 0.4),
                valueColor: const AlwaysStoppedAnimation(AppColorsLight.gold),
              ),
            ),
          ),
          if (info.seats == 0) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('team.noSeats'),
              style: typography.caption.copyWith(
                color: AppColorsFixed.attorneyCardDescriptionText,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _MemberTile extends StatelessWidget {
  const _MemberTile({
    required this.member,
    required this.t,
    required this.onTap,
  });

  final TeamMember member;
  final Translator t;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final active = member.status == MemberStatus.active;
    return AppCard(
      onTap: onTap,
      child: Row(
        children: [
          CircleAvatar(
            radius: 22,
            backgroundColor: colors.goldTint,
            child: AppIcon(AppIcons.supportAgentRounded, color: colors.gold),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        member.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: typography.body.copyWith(
                          color: colors.text,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 2,
                      ),
                      decoration: BoxDecoration(
                        color: (active ? colors.success : colors.gold)
                            .withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                      ),
                      child: Text(
                        t.t(
                          active ? 'team.status.active' : 'team.status.invited',
                        ),
                        style: typography.caption.copyWith(
                          color: active ? colors.success : colors.gold,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
                if (member.name != null)
                  Text(
                    member.phone,
                    style: typography.caption
                        .copyWith(color: colors.textSecondary),
                  ),
                const SizedBox(height: AppSpacing.xs),
                Wrap(
                  spacing: 6,
                  runSpacing: 4,
                  children: [
                    for (final d in AssistantDuty.values)
                      if (member.duties.contains(d))
                        Tooltip(
                          message: dutyLabel(t, d),
                          child: AppIcon(
                            dutyIcon(d),
                            size: 16,
                            color: colors.textSecondary,
                          ),
                        ),
                  ],
                ),
              ],
            ),
          ),
          AppIcon(AppIcons.chevronRightRounded, color: colors.textSecondary),
        ],
      ),
    );
  }
}

class _AddSheet extends ConsumerStatefulWidget {
  const _AddSheet();

  @override
  ConsumerState<_AddSheet> createState() => _AddSheetState();
}

class _AddSheetState extends ConsumerState<_AddSheet> {
  final _phone = TextEditingController();
  final _name = TextEditingController();
  bool _busy = false;
  bool _tried = false;

  @override
  void dispose() {
    _phone.dispose();
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    setState(() => _tried = true);
    if (!phoneE164.hasMatch(_phone.text.trim())) return;
    setState(() => _busy = true);
    try {
      await ref.read(teamProvider.notifier).add(
            _phone.text.trim(),
            name: _name.text.trim().isEmpty ? null : _name.text.trim(),
          );
      if (mounted) Navigator.of(context).pop(true);
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
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            key: const ValueKey('team-add-phone'),
            controller: _phone,
            label: t.t('team.add.phone'),
            hintText: '+13125550123',
            keyboardType: TextInputType.phone,
            autofocus: true,
            leading: const AppIcon(AppIcons.phoneOutlined),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp('[+0-9]')),
            ],
            errorText: _tried && !phoneE164.hasMatch(_phone.text.trim())
                ? t.t('plans.phones.invalid')
                : null,
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            key: const ValueKey('team-add-name'),
            controller: _name,
            label: t.t('team.add.name'),
            textCapitalization: TextCapitalization.words,
            maxLength: 80,
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

class _MemberSheet extends ConsumerStatefulWidget {
  const _MemberSheet({required this.member});

  final TeamMember member;

  @override
  ConsumerState<_MemberSheet> createState() => _MemberSheetState();
}

class _MemberSheetState extends ConsumerState<_MemberSheet> {
  late Set<AssistantDuty> _duties = {...widget.member.duties};
  late final _name = TextEditingController(text: widget.member.name ?? '');
  bool _busy = false;

  /// OQ-049: the attorney accepted responsibility in this sheet.
  bool _accepted = false;

  Future<void> _toggle(AssistantDuty d, bool on) async {
    if (on) {
      final t = ref.read(translatorProvider);
      final ok = await askLiability(context, t, dutyLabel(t, d));
      if (!ok || !mounted) return;
      _accepted = true;
    }
    setState(() {
      _duties = {..._duties};
      on ? _duties.add(d) : _duties.remove(d);
    });
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      final n = ref.read(teamProvider.notifier);
      if (_name.text.trim() != (widget.member.name ?? '')) {
        await n.rename(widget.member.id, _name.text.trim());
      }
      if (_duties.length != widget.member.duties.length ||
          !_duties.containsAll(widget.member.duties)) {
        await n.setDuties(
          widget.member.id,
          _duties,
          acceptLiability: _accepted,
        );
      }
      if (!mounted) return;
      Navigator.of(context).pop();
      showAppSnackBar(context, t.t('team.saved'));
    } on Object catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showAppSnackBar(context, errorText(t, e));
      }
    }
  }

  Future<void> _remove() async {
    final t = ref.read(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(
          t.t('team.remove.confirm', {
            'name': widget.member.label,
          }),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(
              t.t('team.remove'),
              style: TextStyle(color: colors.dangerText),
            ),
          ),
        ],
      ),
    );
    if (!(ok ?? false) || !mounted) return;
    try {
      await ref.read(teamProvider.notifier).remove(widget.member.id);
      if (mounted) Navigator.of(context).pop();
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      builder: (context, scroll) => ListView(
        controller: scroll,
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          0,
          AppSpacing.screenSide,
          AppSpacing.xxl + MediaQuery.viewInsetsOf(context).bottom,
        ),
        children: [
          Text(
            widget.member.label,
            style: typography.titleMedium.copyWith(color: colors.text),
          ),
          Text(
            widget.member.phone,
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.lg),
          AppTextField(
            key: const ValueKey('member-name'),
            controller: _name,
            label: t.t('team.add.name'),
            textCapitalization: TextCapitalization.words,
            maxLength: 80,
          ),
          const SizedBox(height: AppSpacing.sm),
          Container(
            key: const ValueKey('liability-note'),
            padding: const EdgeInsets.all(AppSpacing.md),
            margin: const EdgeInsets.only(bottom: AppSpacing.md),
            decoration: BoxDecoration(
              color: colors.goldTint,
              borderRadius: BorderRadius.circular(AppRadii.field),
              border: Border.all(color: colors.goldStroke),
            ),
            child: Text(
              widget.member.liabilityAcceptedAt == null
                  ? t.t('team.noAccess')
                  : t.t('team.liabilityAccepted', {
                      'date': ref
                          .read(l10nFormatsProvider)
                          .dateTime(widget.member.liabilityAcceptedAt!),
                    }),
              style: typography.bodySmall.copyWith(color: colors.text),
            ),
          ),
          Text(
            t.t('team.duties'),
            style: typography.body.copyWith(
              color: colors.text,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          for (final d in AssistantDuty.values)
            SwitchListTile.adaptive(
              key: ValueKey('duty-${d.wire}'),
              contentPadding: EdgeInsets.zero,
              secondary: AppIcon(dutyIcon(d), color: colors.gold),
              title: Text(
                dutyLabel(t, d),
                style: typography.body.copyWith(color: colors.text),
              ),
              subtitle: Text(
                dutyHint(t, d),
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
              value: _duties.contains(d),
              activeThumbColor: colors.gold,
              onChanged: (v) => _toggle(d, v),
            ),
          const SizedBox(height: AppSpacing.lg),
          AppButton(
            key: const ValueKey('member-save'),
            label: t.t('common.save'),
            isLoading: _busy,
            onPressed: _save,
          ),
          const SizedBox(height: AppSpacing.sm),
          TextButton(
            key: const ValueKey('member-remove'),
            onPressed: _remove,
            child: Text(
              t.t('team.remove'),
              style: TextStyle(color: colors.dangerText),
            ),
          ),
        ],
      ),
    );
  }
}
