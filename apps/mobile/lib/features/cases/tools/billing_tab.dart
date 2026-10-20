import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/tools/billing_data.dart';
import 'package:lawbid/features/cases/tools/billing_logic.dart';
import 'package:lawbid/features/cases/tools/billing_sheets.dart';
import 'package:lawbid/features/cases/workspace/file_actions.dart';
import 'package:lawbid/features/cases/workspace/workspace_view.dart'
    show WorkspaceReadOnlyNote;
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:url_launcher/url_launcher.dart';

/// Case tab "Time": the attorney's timer, time, expenses and invoices; the
/// client sees the invoices only (a document, no payment in the app).
class BillingTab extends ConsumerStatefulWidget {
  const BillingTab({required this.caseId, required this.isAttorney, super.key});

  final String caseId;
  final bool isAttorney;

  @override
  ConsumerState<BillingTab> createState() => _BillingTabState();
}

class _BillingTabState extends ConsumerState<BillingTab>
    with WidgetsBindingObserver {
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// A timer may have been stopped elsewhere while the app slept.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(ref.read(caseBillingActionsProvider).reload(widget.caseId));
    }
  }

  /// Runs a mutation once at a time; an error shows as a snackbar.
  Future<void> _do(Future<void> Function() action) async {
    if (_busy) return;
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await action();
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  api.CaseBillingDto? get _data =>
      ref.read(caseBillingProvider(widget.caseId)).value;

  Future<void> _rate() async {
    final d = _data;
    if (d == null) return;
    final cents = await showRateSheet(
      context,
      currentCents: d.hourlyRateCents?.toInt(),
      currency: d.currency,
    );
    if (cents == null || !mounted) return;
    await _do(
      () => ref.read(caseBillingActionsProvider).setRate(widget.caseId, cents),
    );
  }

  Future<void> _addTime() async {
    final r = await showTimeSheet(context);
    if (r == null || !mounted) return;
    await _do(
      () => ref.read(caseBillingActionsProvider).addTime(
            widget.caseId,
            day: r.day,
            minutes: r.minutes,
            note: r.note,
          ),
    );
  }

  Future<void> _editTime(api.TimeEntryDto e) async {
    final r = await showTimeSheet(
      context,
      day: dayOnScreen(e.workedOn),
      minutes: e.minutes.toInt(),
      note: e.note,
    );
    if (r == null || !mounted) return;
    await _do(
      () => ref.read(caseBillingActionsProvider).updateTime(
            widget.caseId,
            e.id,
            day: r.day,
            minutes: r.minutes,
            note: r.note,
          ),
    );
  }

  Future<bool> _confirmDelete() {
    final t = ref.read(translatorProvider);
    return confirmBilling(
      context,
      title: t.t('billing.delete.title'),
      body: '',
      action: t.t('billing.delete'),
      cancel: t.t('billing.cancel'),
      destructive: true,
    );
  }

  Future<void> _deleteTime(api.TimeEntryDto e) async {
    if (!await _confirmDelete() || !mounted) return;
    await _do(
      () =>
          ref.read(caseBillingActionsProvider).deleteTime(widget.caseId, e.id),
    );
  }

  Future<void> _addExpense() async {
    final d = _data;
    if (d == null) return;
    final r = await showExpenseSheet(context, currency: d.currency);
    if (r == null || !mounted) return;
    await _do(
      () => ref.read(caseBillingActionsProvider).addExpense(
            widget.caseId,
            day: r.day,
            description: r.description,
            cents: r.cents,
            receipt: r.receipt,
          ),
    );
  }

  Future<void> _deleteExpense(api.ExpenseDto e) async {
    if (!await _confirmDelete() || !mounted) return;
    await _do(
      () => ref
          .read(caseBillingActionsProvider)
          .deleteExpense(widget.caseId, e.id),
    );
  }

  Future<void> _issue(api.CaseBillingDto d) async {
    final t = ref.read(translatorProvider);
    final formats = ref.read(l10nFormatsProvider);
    final ok = await confirmBilling(
      context,
      title: t.t('billing.issue.title'),
      body: t.t('billing.issue.body', {
        'total': formats.currencyFromCents(
          d.unbilled.totalCents.toInt(),
          currencyCode: d.currency,
        ),
      }),
      action: t.t('billing.issue'),
      cancel: t.t('billing.cancel'),
    );
    if (!ok || !mounted) return;
    await _do(
      () => ref.read(caseBillingActionsProvider).issueInvoice(widget.caseId),
    );
  }

  Future<void> _openReceipt(api.ExpenseDto e) async {
    final t = ref.read(translatorProvider);
    final preview = e.receiptPreviewUrl;
    final url = e.receiptUrl;
    if (preview != null) {
      await showPhotoGallery(
        context,
        urls: [preview],
        closeLabel: t.t('common.close'),
      );
    } else if (url != null) {
      await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final value = ref.watch(caseBillingProvider(widget.caseId));
    return value.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.lg),
        child: AppSkeleton(height: 120),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Text(errorText(t, e)),
      ),
      data: (d) {
        final attorney =
            widget.isAttorney && d.role == api.CaseBillingDtoRole.attorney;
        final canEdit = attorney && d.canEdit;
        return Padding(
          padding: const EdgeInsetsDirectional.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.sm,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (attorney) ...[
                if (!canEdit)
                  WorkspaceReadOnlyNote(
                    text: t.t('billing.readonly'),
                    padding: EdgeInsets.zero,
                  ),
                _RateTimerCard(
                  data: d,
                  t: t,
                  formats: formats,
                  canEdit: canEdit,
                  busy: _busy,
                  onRate: _rate,
                  onStart: () => _do(
                    () => ref
                        .read(caseBillingActionsProvider)
                        .startTimer(widget.caseId),
                  ),
                  onStop: () => _do(
                    () => ref
                        .read(caseBillingActionsProvider)
                        .stopTimer(widget.caseId),
                  ),
                ),
                const SizedBox(height: AppSpacing.md),
                _UnbilledCard(
                  data: d,
                  t: t,
                  formats: formats,
                  canIssue: canEdit && !_busy && d.unbilled.totalCents > 0,
                  onIssue: () => _issue(d),
                ),
                if (canEdit) ...[
                  const SizedBox(height: AppSpacing.md),
                  Row(
                    children: [
                      Expanded(
                        child: AppButton(
                          label: t.t('billing.addTime'),
                          icon: AppIcons.addRounded,
                          variant: AppButtonVariant.secondary,
                          onPressed: _addTime,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(
                        child: AppButton(
                          label: t.t('billing.addExpense'),
                          icon: AppIcons.addRounded,
                          variant: AppButtonVariant.secondary,
                          onPressed: _addExpense,
                        ),
                      ),
                    ],
                  ),
                ],
                ..._timeRows(d, t, formats, canEdit),
                ..._expenseRows(d, t, formats, canEdit),
              ] else
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: _InfoNote(text: t.t('billing.info')),
                ),
              _SectionTitle(t.t('billing.invoices')),
              if (d.invoices.isEmpty)
                _Muted(t.t('billing.invoices.empty'))
              else
                for (final i in d.invoices)
                  _InvoiceRow(invoice: i, t: t, formats: formats),
            ],
          ),
        );
      },
    );
  }

  List<Widget> _timeRows(
    api.CaseBillingDto d,
    Translator t,
    L10nFormats f,
    bool canEdit,
  ) {
    final rows = [
      for (final e in d.entries)
        if (e.invoiceId == null && e.runningSince == null) e,
    ];
    if (rows.isEmpty) return const [];
    return [
      _SectionTitle(t.t('billing.time')),
      for (final e in rows)
        _EntryRow(
          title: '${durationText(t, e.minutes.toInt())} · ${f.currencyFromCents(
            e.cents.toInt(),
            currencyCode: d.currency,
          )}',
          subtitle: [
            f.date(dayOnScreen(e.workedOn)),
            if (e.note.isNotEmpty) e.note,
          ].join(' · '),
          t: t,
          onTap: canEdit ? () => _editTime(e) : null,
          onDelete: canEdit ? () => _deleteTime(e) : null,
        ),
    ];
  }

  List<Widget> _expenseRows(
    api.CaseBillingDto d,
    Translator t,
    L10nFormats f,
    bool canEdit,
  ) {
    final rows = [
      for (final e in d.expenses)
        if (e.invoiceId == null) e,
    ];
    if (rows.isEmpty) return const [];
    return [
      _SectionTitle(t.t('billing.expenses')),
      for (final e in rows)
        _EntryRow(
          title: '${f.currencyFromCents(
            e.amountCents.toInt(),
            currencyCode: d.currency,
          )} · ${e.description}',
          subtitle: f.date(dayOnScreen(e.spentOn)),
          t: t,
          onReceipt: e.receiptUrl == null && e.receiptPreviewUrl == null
              ? null
              : () => _openReceipt(e),
          onDelete: canEdit ? () => _deleteExpense(e) : null,
        ),
    ];
  }
}

/// `1 h 05 min` / `45 min` in the app's language.
String durationText(Translator t, int minutes) {
  final s = splitMinutes(minutes);
  return s.hours == 0
      ? t.t('billing.mOnly', {'m': '${s.minutes}'})
      : t.t('billing.hm', {'h': '${s.hours}', 'm': '${s.minutes}'});
}

BoxDecoration _cardBox(AppColorTokens colors) => BoxDecoration(
      color: colors.surface,
      borderRadius: BorderRadius.circular(AppRadii.card),
      border: Border.all(color: colors.border),
    );

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsetsDirectional.only(
        top: AppSpacing.xl,
        bottom: AppSpacing.sm,
      ),
      child: Semantics(
        header: true,
        child: Text(
          text,
          style: type.body.copyWith(fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

class _Muted extends StatelessWidget {
  const _Muted(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Text(text, style: type.body.copyWith(color: colors.textSecondary));
  }
}

class _InfoNote extends StatelessWidget {
  const _InfoNote({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.infoTint,
        borderRadius: BorderRadius.circular(AppRadii.card),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const AppIcon(AppIcons.receiptLongOutlined, size: AppSizes.iconSm),
          const SizedBox(width: AppSpacing.sm),
          Expanded(child: Text(text, style: type.bodySmall)),
        ],
      ),
    );
  }
}

/// Rate (tap to change) and the timer with its Start / Stop.
class _RateTimerCard extends StatelessWidget {
  const _RateTimerCard({
    required this.data,
    required this.t,
    required this.formats,
    required this.canEdit,
    required this.busy,
    required this.onRate,
    required this.onStart,
    required this.onStop,
  });

  final api.CaseBillingDto data;
  final Translator t;
  final L10nFormats formats;
  final bool canEdit;
  final bool busy;
  final VoidCallback onRate;
  final VoidCallback onStart;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final rate = data.hourlyRateCents;
    final rateText = rate == null
        ? t.t('billing.rate.unset')
        : t.t('billing.perHour', {
            'n': formats.currencyFromCents(
              rate.toInt(),
              currencyCode: data.currency,
            ),
          });
    final timer = data.timer;
    final base = timer == null
        ? 0
        : data.entries
                .where((e) => e.id == timer.entryId)
                .map((e) => e.minutes.toInt())
                .firstOrNull ??
            0;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: _cardBox(colors),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  t.t('billing.rate'),
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
              ),
              Flexible(
                child: Semantics(
                  button: canEdit,
                  label: '${t.t('billing.rate')}: $rateText',
                  excludeSemantics: true,
                  child: AppPressable(
                    onTap: canEdit ? onRate : null,
                    child: ConstrainedBox(
                      constraints:
                          const BoxConstraints(minHeight: AppSizes.touchTarget),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Flexible(
                            child: Text(
                              rateText,
                              style: type.body
                                  .copyWith(fontWeight: FontWeight.w700),
                            ),
                          ),
                          if (canEdit) ...[
                            const SizedBox(width: AppSpacing.xs),
                            const AppIcon(
                              AppIcons.editOutlined,
                              size: AppSizes.iconSm,
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              const AppIcon(AppIcons.timerOutlined, size: AppSizes.iconMd),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: timer == null
                    ? Text(
                        t.t('billing.timer'),
                        style: type.body.copyWith(color: colors.textSecondary),
                      )
                    : _ElapsedText(
                        key: ValueKey(timer.entryId),
                        since: timer.startedAt,
                        baseMinutes: base,
                        style: type.titleMedium,
                        label: t.t('billing.running'),
                      ),
              ),
            ],
          ),
          if (canEdit) ...[
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: timer == null ? t.t('billing.start') : t.t('billing.stop'),
              icon: timer == null
                  ? AppIcons.playArrowRounded
                  : AppIcons.pauseRounded,
              variant: timer == null
                  ? AppButtonVariant.primary
                  : AppButtonVariant.secondary,
              isEnabled: !busy,
              onPressed: timer == null ? onStart : onStop,
            ),
          ],
        ],
      ),
    );
  }
}

/// The running timer's face; ticks every second on its own, so only this
/// text rebuilds. Cancelled when the widget goes away.
class _ElapsedText extends StatefulWidget {
  const _ElapsedText({
    required this.since,
    required this.baseMinutes,
    required this.style,
    required this.label,
    super.key,
  });

  final DateTime since;
  final int baseMinutes;
  final TextStyle style;
  final String label;

  @override
  State<_ElapsedText> createState() => _ElapsedTextState();
}

class _ElapsedTextState extends State<_ElapsedText> {
  Timer? _tick;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = clockText(
      liveSeconds(
        baseMinutes: widget.baseMinutes,
        since: widget.since,
        now: _now,
      ),
    );
    // A screen reader hears the label once, not a new number every second.
    return Semantics(
      label: '${widget.label} $text',
      liveRegion: false,
      excludeSemantics: true,
      child: Text(
        text,
        style: widget.style.copyWith(
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      ),
    );
  }
}

class _UnbilledCard extends StatelessWidget {
  const _UnbilledCard({
    required this.data,
    required this.t,
    required this.formats,
    required this.canIssue,
    required this.onIssue,
  });

  final api.CaseBillingDto data;
  final Translator t;
  final L10nFormats formats;
  final bool canIssue;
  final VoidCallback onIssue;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final u = data.unbilled;
    String money(num c) =>
        formats.currencyFromCents(c.toInt(), currencyCode: data.currency);
    Widget line(String label, String value, {bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  label,
                  style: (bold ? type.body : type.bodySmall).copyWith(
                    color: bold ? colors.text : colors.textSecondary,
                    fontWeight: bold ? FontWeight.w700 : null,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                value,
                style: type.body.copyWith(
                  fontWeight: bold ? FontWeight.w700 : FontWeight.w600,
                ),
              ),
            ],
          ),
        );
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: _cardBox(colors),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            t.t('billing.unbilled'),
            style: type.bodySmall.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.xs),
          line(
            '${t.t('billing.time')} · ${durationText(t, u.minutes.toInt())}',
            money(u.timeCents),
          ),
          line(t.t('billing.expenses'), money(u.expensesCents)),
          line(t.t('billing.total'), money(u.totalCents), bold: true),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: t.t('billing.issue'),
            icon: AppIcons.receiptLongRounded,
            isEnabled: canIssue,
            onPressed: onIssue,
          ),
        ],
      ),
    );
  }
}

/// A time entry or an expense: title, subtitle, and its small actions.
class _EntryRow extends StatelessWidget {
  const _EntryRow({
    required this.title,
    required this.subtitle,
    required this.t,
    this.onTap,
    this.onDelete,
    this.onReceipt,
  });

  final String title;
  final String subtitle;
  final Translator t;
  final VoidCallback? onTap;
  final VoidCallback? onDelete;
  final VoidCallback? onReceipt;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final body = Padding(
      padding: const EdgeInsetsDirectional.only(
        start: AppSpacing.md,
        top: AppSpacing.sm,
        bottom: AppSpacing.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: type.body.copyWith(fontWeight: FontWeight.w600)),
          if (subtitle.isNotEmpty)
            Text(
              subtitle,
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
        ],
      ),
    );
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      decoration: _cardBox(colors),
      child: Row(
        children: [
          Expanded(
            child: onTap == null
                ? body
                : Semantics(
                    button: true,
                    label: '${t.t('billing.edit')}: $title',
                    excludeSemantics: true,
                    child: AppPressable(onTap: onTap, child: body),
                  ),
          ),
          if (onReceipt != null)
            AppIconButton(
              icon: const AppIcon(AppIcons.receiptLongOutlined),
              semanticLabel: t.t('billing.receipt.open'),
              onPressed: onReceipt,
            ),
          if (onDelete != null)
            AppIconButton(
              icon: const AppIcon(AppIcons.deleteOutlineRounded),
              semanticLabel: t.t('billing.delete'),
              onPressed: onDelete,
            ),
        ],
      ),
    );
  }
}

class _InvoiceRow extends StatelessWidget {
  const _InvoiceRow({
    required this.invoice,
    required this.t,
    required this.formats,
  });

  final api.InvoiceDto invoice;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final url = invoice.url;
    return Container(
      margin: const EdgeInsets.only(bottom: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: _cardBox(colors),
      child: Row(
        children: [
          const AppIcon(AppIcons.pictureAsPdfOutlined, size: AppSizes.iconMd),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  invoice.number,
                  style: type.body.copyWith(fontWeight: FontWeight.w700),
                ),
                Text(
                  '${formats.currencyFromCents(
                    invoice.totalCents.toInt(),
                    currencyCode: invoice.currency,
                  )} · ${formats.date(invoice.createdAt)}',
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
          if (url != null) ...[
            const SizedBox(width: AppSpacing.sm),
            Semantics(
              label: '${t.t('billing.open')} ${invoice.number}',
              child: FileOpenButton.ref(
                file: FileRef(
                  fileId: invoice.fileId,
                  mime: 'application/pdf',
                  url: url,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
