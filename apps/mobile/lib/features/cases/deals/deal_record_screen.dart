import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/deals/deal_record_card.dart';
import 'package:lawbid/features/cases/deals/deal_record_data.dart';
import 'package:lawbid/features/cases/deals/deal_record_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/cases/tools/signature_pad.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Deal record 2026-10-27 (docs/architecture/DEAL_RECORD_PLAN_2026-10-27.md
/// §7): one scrollable page — summary table, the offer history by day
/// (collapsed, tap a day to expand), the three consent lines in the user's
/// language, the signature pad, "Confirm" (grey until a signature is drawn,
/// then the app accent) and "Decline". The same screen serves the client
/// (who accepted) and then the attorney. Back always works.
class DealRecordScreen extends ConsumerStatefulWidget {
  const DealRecordScreen({required this.recordId, super.key});

  final String recordId;

  @override
  ConsumerState<DealRecordScreen> createState() => _DealRecordScreenState();
}

class _DealRecordScreenState extends ConsumerState<DealRecordScreen> {
  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(dealRecordProvider(widget.recordId));
    // While the PDF is being prepared the record changes without us: poll
    // gently (the server renders in a background job, ~1-2 s).
    final preparing = value.value?.status == api.DealRecordStatus.preparing ||
        value.value?.status == api.DealRecordStatus.sealing;
    if (preparing) {
      Future<void>.delayed(const Duration(seconds: 2), () {
        if (mounted) ref.invalidate(dealRecordProvider(widget.recordId));
      });
    }
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go(AppRoutes.mine),
        ),
        title: Text(t.t('deal.title')),
      ),
      body: AsyncDetailBody<api.DealRecordDto>(
        value: value,
        t: t,
        onRetry: () => ref.invalidate(dealRecordProvider(widget.recordId)),
        builder: (r) => DealRecordBody(record: r),
      ),
    );
  }
}

/// The page itself (exported for the widget tests).
class DealRecordBody extends ConsumerStatefulWidget {
  const DealRecordBody({required this.record, super.key});

  final api.DealRecordDto record;

  @override
  ConsumerState<DealRecordBody> createState() => _DealRecordBodyState();
}

class _DealRecordBodyState extends ConsumerState<DealRecordBody> {
  final _pad = SignatureController();
  final _name = TextEditingController();
  final Set<DateTime> _expanded = {};
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _name.text = _myName;
    final days = DealRecordFormat.byDay(widget.record.history);
    // The latest day open, earlier days collapsed (owner: history by date).
    if (days.isNotEmpty) _expanded.add(days.last.$1);
  }

  @override
  void dispose() {
    _pad.dispose();
    _name.dispose();
    super.dispose();
  }

  api.DealRecordDto get r => widget.record;

  String get _myName => r.myRole == api.PartyRole.client
      ? r.client.fullName
      : r.attorney.fullName;

  /// Owner: if the profile lacks a last name, ask once before signing.
  bool get _nameOk {
    final parts =
        _name.text.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    return parts.length >= 2;
  }

  bool get _canSign => r.myTurnToSign && !_busy;

  Future<void> _confirm() async {
    if (_busy || _pad.isEmpty) return;
    final t = ref.read(translatorProvider);
    if (!_nameOk) {
      setState(() => _error = t.t('deal.nameAsk'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final png = await _pad.toBase64();
      if (png == null) {
        setState(() {
          _busy = false;
          _error = t.t('sign.drawFirst');
        });
        return;
      }
      final updated = await ref.read(dealRecordActionsProvider).sign(
            r.id,
            name: _name.text.trim(),
            imagePngBase64: png,
          );
      if (!mounted) return;
      showAppSnackBar(
        context,
        t.t(
          updated.status == api.DealRecordStatus.awaitingSignatures
              ? 'deal.status.otherTurn'
              : 'cases.status.acceptedByBoth',
        ),
      );
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _error = errorText(ref.read(translatorProvider), e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _decline() async {
    final t = ref.read(translatorProvider);
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('deal.decline'),
      message: t.t('deal.decline.message'),
      confirmLabel: t.t('deal.decline'),
      destructive: true,
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(dealRecordActionsProvider).decline(r.id);
      if (mounted) showAppSnackBar(context, t.t('deal.status.declined'));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final live = r.status == api.DealRecordStatus.preparing ||
        r.status == api.DealRecordStatus.awaitingSignatures;
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                t.t('deal.subtitle'),
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            StatusPill(
              label: DealRecordFormat.statusLabel(t, r),
              tone: DealRecordFormat.statusTone(r),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        _SummaryTable(record: r, t: t, formats: formats),
        const SizedBox(height: AppSpacing.section),
        DetailSection(
          title: t.t('deal.history'),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              for (final (day, offers) in DealRecordFormat.byDay(r.history))
                _DayGroup(
                  day: day,
                  offers: offers,
                  expanded: _expanded.contains(day),
                  onToggle: () => setState(() {
                    if (!_expanded.remove(day)) _expanded.add(day);
                  }),
                  t: t,
                  formats: formats,
                ),
            ],
          ),
        ),
        if (r.status == api.DealRecordStatus.valueSealed ||
            r.status == api.DealRecordStatus.sealing) ...[
          const SizedBox(height: AppSpacing.section),
          DealRecordFiles(record: r),
        ],
        if (live) ...[
          const SizedBox(height: AppSpacing.section),
          _ConsentLines(t: t),
          const SizedBox(height: AppSpacing.md),
          if (r.myTurnToSign) ...[
            AppTextField(
              controller: _name,
              label: t.t('sign.name'),
              maxLength: 120,
              enabled: !_busy,
              textCapitalization: TextCapitalization.words,
              onChanged: (_) => setState(() => _error = null),
            ),
            if (!_nameOk)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Text(
                  t.t('deal.nameAsk'),
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ),
            const SizedBox(height: AppSpacing.md),
            ListenableBuilder(
              listenable: _pad,
              builder: (context, _) => SignaturePad(
                controller: _pad,
                hint: t.t('sign.padHint'),
                clearLabel: t.t('sign.clear'),
                semanticLabel: t.t('sign.padLabel'),
              ),
            ),
          ] else
            Text(
              r.status == api.DealRecordStatus.preparing
                  ? t.t('deal.status.preparing')
                  : t.t('deal.status.otherTurn'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.sm),
              child: Text(
                _error!,
                style: type.bodySmall.copyWith(color: colors.danger),
              ),
            ),
          const SizedBox(height: AppSpacing.md),
          ListenableBuilder(
            listenable: _pad,
            builder: (context, _) => DealConfirmButton(
              label: t.t('deal.confirm'),
              enabled: _canSign && !_pad.isEmpty,
              busy: _busy,
              onPressed: _confirm,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: t.t('deal.decline'),
            variant: AppButtonVariant.secondary,
            onPressed: _busy ? null : _decline,
          ),
        ],
      ],
    );
  }
}

/// Grey while nothing is drawn, the app accent once a signature exists
/// (owner: "серая кнопка становится активной"). Semantics carry the state.
class DealConfirmButton extends StatelessWidget {
  const DealConfirmButton({
    required this.label,
    required this.enabled,
    required this.onPressed,
    this.busy = false,
    super.key,
  });

  final String label;
  final bool enabled;
  final bool busy;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final bg = enabled ? colors.accent : colors.chip;
    final fg = enabled ? colors.onAccent : colors.textSecondary;
    return Semantics(
      button: true,
      enabled: enabled,
      label: label,
      child: AnimatedContainer(
        duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
        height: 50,
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(AppRadii.button),
        ),
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(AppRadii.button),
            onTap: enabled && !busy ? onPressed : null,
            child: Center(
              child: busy
                  ? SizedBox.square(
                      dimension: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: fg,
                      ),
                    )
                  : Text(label, style: type.button.copyWith(color: fg)),
            ),
          ),
        ),
      ),
    );
  }
}

class _SummaryTable extends StatelessWidget {
  const _SummaryTable({
    required this.record,
    required this.t,
    required this.formats,
  });

  final api.DealRecordDto record;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final r = record;
    String party(String fullName, String? email, String? username) => [
          fullName,
          if (email != null) email,
          if (username != null) '@$username',
        ].join(' · ');
    final att = r.attorney;
    final bar = [
      if (att.barState != null) att.barState!,
      if (att.barNumber != null) '#${att.barNumber}',
    ].join(' ');
    final rows = <(String, String)>[
      (t.t('deal.row.case'), r.caseValue.title),
      (
        t.t('deal.row.client'),
        party(r.client.fullName, r.client.email, r.client.username)
      ),
      (
        t.t('deal.row.attorney'),
        [
          party(att.fullName, att.email, att.username),
          if (bar.isNotEmpty) bar,
          if (att.firmName != null) att.firmName!,
        ].join(' · ')
      ),
      (
        t.t('deal.row.terms'),
        DealRecordFormat.termsLines(t, formats, r.terms).join('\n')
      ),
      (t.t('deal.row.accepted'), formats.dateTime(r.acceptedAt.toLocal())),
    ];
    return AppCard(
      child: Column(
        children: [
          for (final (i, row) in rows.indexed) ...[
            if (i > 0) Divider(height: AppSpacing.lg, color: colors.border),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                SizedBox(
                  width: 96,
                  child: Text(
                    row.$1,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(child: Text(row.$2, style: type.bodySmall)),
              ],
            ),
          ],
          Divider(height: AppSpacing.lg, color: colors.border),
          Text(
            r.recordCode,
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _DayGroup extends StatelessWidget {
  const _DayGroup({
    required this.day,
    required this.offers,
    required this.expanded,
    required this.onToggle,
    required this.t,
    required this.formats,
  });

  final DateTime day;
  final List<api.DealOfferDto> offers;
  final bool expanded;
  final VoidCallback onToggle;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          onTap: onToggle,
          borderRadius: BorderRadius.circular(AppRadii.button),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    formats.dateLong(day),
                    style: type.bodySmall.copyWith(color: colors.gold),
                  ),
                ),
                Text(
                  t.t('deal.history.count', {'n': '${offers.length}'}),
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(width: AppSpacing.xs),
                AnimatedRotation(
                  turns: expanded ? 0.5 : 0,
                  duration: context.reduceMotion
                      ? Duration.zero
                      : AppMotion.stateChange,
                  child: AppIcon(
                    AppIcons.expandMoreRounded,
                    size: 18,
                    color: colors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ),
        AnimatedSize(
          duration:
              context.reduceMotion ? Duration.zero : AppMotion.stateChange,
          curve: AppMotion.enterCurve,
          alignment: Alignment.topCenter,
          child: !expanded
              ? const SizedBox(width: double.infinity)
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (final o in offers)
                      Padding(
                        padding: const EdgeInsetsDirectional.only(
                          start: AppSpacing.sm,
                          bottom: AppSpacing.md,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '${formats.time(o.createdAt.toLocal())} · '
                              '${DealRecordFormat.offerHeadline(
                                t,
                                formats,
                                o,
                              )}',
                              style: type.bodySmall,
                            ),
                            if (o.paymentTerms != null)
                              Text(
                                DealRecordFormat.describe(
                                  t,
                                  formats,
                                  o.paymentTerms!,
                                ).join(' · '),
                                style: type.caption
                                    .copyWith(color: colors.textSecondary),
                              ),
                            if ((o.message ?? '').trim().isNotEmpty)
                              Padding(
                                padding:
                                    const EdgeInsets.only(top: AppSpacing.xs),
                                child: Text(o.message!, style: type.body),
                              ),
                          ],
                        ),
                      ),
                  ],
                ),
        ),
      ],
    );
  }
}

/// The three admin-editable lines, in the user's language (not in the PDF).
class _ConsentLines extends StatelessWidget {
  const _ConsentLines({required this.t});

  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final k in const [
          'deal_record.consent.not_contract',
          'deal_record.consent.platform',
          'deal_record.consent.accurate',
        ])
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.xs),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppIcon(
                  AppIcons.checkCircleOutlineRounded,
                  size: 16,
                  color: colors.textSecondary,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(child: Text(t.t(k), style: type.bodySmall)),
              ],
            ),
          ),
      ],
    );
  }
}
