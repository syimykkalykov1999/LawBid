import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/assistant_code_card.dart';
import 'package:lawbid/features/team/presentation/team_widgets.dart';

/// Owner 2026-10-22: the 10 duties in three groups — what reaches the
/// assistant (calls, chats, files), the work they prepare, and what they
/// may do in the attorney's own name.
const assistantRoleGroups = <(String, List<AssistantDuty>)>[
  (
    'team.roles.group.talk',
    [AssistantDuty.calls, AssistantDuty.chats, AssistantDuty.files],
  ),
  (
    'team.roles.group.work',
    [
      AssistantDuty.cases,
      AssistantDuty.tasks,
      AssistantDuty.bidDrafts,
      AssistantDuty.posts,
      AssistantDuty.profile,
    ],
  ),
  ('team.roles.group.name', [AssistantDuty.bids, AssistantDuty.publish]),
];

/// Owner 2026-10-22 — «Роли помощников» (the Team tab's header), open to
/// EVERY attorney: the 10 duties with one line each. With assistants the
/// switches give the chosen assistant a duty (at most [TeamInfo.maxDuties]
/// each — more assistants, nobody with the whole account); without a free
/// seat a switch or «Add assistant» opens the seat purchase (no paid plan
/// → the plan picker, a trial → «after the first payment»).
class AssistantRolesScreen extends ConsumerStatefulWidget {
  const AssistantRolesScreen({super.key});

  @override
  ConsumerState<AssistantRolesScreen> createState() =>
      _AssistantRolesScreenState();
}

class _AssistantRolesScreenState extends ConsumerState<AssistantRolesScreen> {
  String? _selectedId;
  bool _busy = false;

  TeamMember? _selected(TeamInfo info) {
    if (info.members.isEmpty) return null;
    return info.members.where((m) => m.id == _selectedId).firstOrNull ??
        info.members.first;
  }

  Future<void> _toggle(TeamInfo info, AssistantDuty d, bool on) async {
    final t = ref.read(translatorProvider);
    final member = _selected(info);
    if (member == null) {
      // Nobody to give it to yet: add an assistant (or buy the seat).
      await addAssistantWithCode(context, ref, info);
      return;
    }
    if (on && member.duties.length >= info.maxDuties) {
      showAppSnackBar(
        context,
        t.t('team.roles.tooMany', {'max': '${info.maxDuties}'}),
      );
      return;
    }
    if (on) {
      final ok = await askLiability(context, t, dutyLabel(t, d));
      if (!ok || !mounted) return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(teamProvider.notifier).setDuties(
            member.id,
            on ? {...member.duties, d} : ({...member.duties}..remove(d)),
            acceptLiability: on,
          );
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
    final team = ref.watch(teamProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('team.roles.title')),
      ),
      body: AsyncDetailBody<TeamInfo>(
        value: team,
        t: t,
        onRetry: () => ref.invalidate(teamProvider),
        builder: (info) => RefreshIndicator(
          color: colors.gold,
          backgroundColor: colors.sheet,
          onRefresh: () => ref.read(teamProvider.notifier).refresh(),
          child: _body(context, t, info),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, Translator t, TeamInfo info) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final selected = _selected(info);
    final unnamed = t.t('team.member.unnamed');
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.lg,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: [
        Container(
          key: const ValueKey('roles-intro'),
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: colors.goldTint,
            borderRadius: BorderRadius.circular(AppRadii.field),
            border: Border.all(color: colors.goldStroke),
          ),
          child: Text(
            t.t('team.roles.intro', {'max': '${info.maxDuties}'}),
            style: typography.bodySmall.copyWith(color: colors.text),
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        if (info.members.isEmpty)
          Text(
            t.t(
              info.hasFreeSeat
                  ? 'team.roles.noAssistant'
                  : 'team.roles.buyHint',
            ),
            key: const ValueKey('roles-empty-note'),
            style: typography.body.copyWith(color: colors.textSecondary),
          )
        else ...[
          Text(
            t.t('team.roles.pick'),
            style: typography.body.copyWith(
              color: colors.text,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.xs,
            children: [
              for (final m in info.members)
                ChoiceChip(
                  key: ValueKey('roles-member-${m.id}'),
                  label: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 160),
                    child: Text(
                      // Owner 2026-10-15: the count in the language's digits.
                      '${m.label.isEmpty ? unnamed : m.label} · '
                      '${ltrIsolate(
                        context.digits('${m.duties.length}/${info.maxDuties}'),
                      )}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  selected: m.id == selected?.id,
                  onSelected: (_) => setState(() => _selectedId = m.id),
                ),
            ],
          ),
        ],
        for (final (groupKey, duties) in assistantRoleGroups) ...[
          const SizedBox(height: AppSpacing.lg),
          Text(
            t.t(groupKey),
            style: typography.caption.copyWith(
              color: colors.textSecondary,
              fontWeight: FontWeight.w700,
            ),
          ),
          for (final d in duties)
            SwitchListTile.adaptive(
              key: ValueKey('role-duty-${d.wire}'),
              contentPadding: EdgeInsets.zero,
              secondary: AppIcon(dutyIcon(d), color: colors.iconTint),
              title: Text(
                dutyLabel(t, d),
                style: typography.body.copyWith(color: colors.text),
              ),
              subtitle: Text(
                dutyHint(t, d),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
              value: selected?.duties.contains(d) ?? false,
              activeThumbColor: colors.gold,
              onChanged: _busy ? null : (v) => _toggle(info, d, v),
            ),
        ],
        const SizedBox(height: AppSpacing.lg),
        AppButton(
          key: const ValueKey('roles-add'),
          label: t.t('team.add'),
          icon: AppIcons.personAddAlt1Rounded,
          variant: info.members.isEmpty
              ? AppButtonVariant.primary
              : AppButtonVariant.secondary,
          onPressed: () => addAssistantWithCode(context, ref, info),
        ),
      ],
    );
  }
}
