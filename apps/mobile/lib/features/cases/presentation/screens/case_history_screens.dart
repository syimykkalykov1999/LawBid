import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/application/case_history_controller.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/reauth_gate_view.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';

/// Reauth errors on a history call → back to the code screen.
bool _isReauthError(Object? e) =>
    e is ApiException &&
    (e.code == ApiErrorCodes.reauthRequired ||
        e.code == ApiErrorCodes.reauthInvalid);

/// docs/04 §12 — Settings → "История кейсов": entry only after reauth
/// (code to the verified phone); read-only list, timelines, PDF export.
class CaseHistoryScreen extends ConsumerWidget {
  const CaseHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final access = ref.watch(historyAccessProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
            semanticLabel: t.t('common.back'), onPressed: () => context.pop()),
        title: Text(t.t('history.title')),
        actions: [
          if (access.isOpen)
            TopBarIcon(
              icon: AppIcons.pictureAsPdfOutlined,
              label: t.t('history.pdf.download'),
              onTap: () => _export(context, ref),
            ),
        ],
      ),
      body: AnimatedSwitcher(
        duration: context.reduceMotion ? Duration.zero : AppMotion.stepSwitch,
        child: access.isOpen
            ? const _HistoryList(key: ValueKey('list'))
            : ReauthGateView(
                key: const ValueKey('reauth'),
                access: access,
                t: t,
                note: t.t('history.readonlyNote'),
              ),
      ),
    );
  }

  Future<void> _export(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('history.pdf.title'),
      message: t.t('history.pdf.message'),
      confirmLabel: t.t('history.pdf.confirm'),
    );
    if (!ok || !context.mounted) return;
    await showAppBottomSheet<void>(
      context: context,
      builder: (_) => const _ExportSheet(),
    );
  }
}

class _HistoryList extends ConsumerWidget {
  const _HistoryList({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final value = ref.watch(caseHistoryProvider);
    final n = ref.read(caseHistoryProvider.notifier);
    ref.listen(caseHistoryProvider, (_, next) {
      if (_isReauthError(next.error))
        ref.read(historyAccessProvider.notifier).lock();
    });
    return PagedListBody<HistoryCase>(
      value: value,
      t: t,
      itemKey: (h) => h.id,
      onRefresh: n.refresh,
      onLoadMore: n.loadMore,
      onRetryMore: n.retryLoadMore,
      empty: AppEmptyState(
          icon: AppIcons.historyRounded, message: t.t('history.empty')),
      itemBuilder: (context, h, _) =>
          _HistoryTile(item: h, t: t, formats: formats),
    );
  }
}

class _HistoryTile extends StatelessWidget {
  const _HistoryTile(
      {required this.item, required this.t, required this.formats});

  final HistoryCase item;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final terms =
        item.acceptedAmountCents == null || item.acceptedFeeType == null
            ? null
            : CaseFormat.terms(
                t, formats, item.acceptedFeeType!, item.acceptedAmountCents!);
    return AppCard(
      elevated: true,
      onTap: () => context.push(AppRoutes.caseHistoryItem(item.id)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${CaseFormat.practice(t, item.practiceI18nKey, item.practiceNameEn)} · ${item.primaryStateCode}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: typography.caption.copyWith(
                      color: colors.goldDark, fontWeight: FontWeight.w600),
                ),
              ),
              if (item.deleted)
                StatusPill(
                    label: t.t('history.deleted'), tone: StatusTone.neutral)
              else
                CaseStatusPill(status: item.status, t: t),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(item.title,
              style: typography.roleTitle.copyWith(color: colors.text)),
          const SizedBox(height: AppSpacing.xs),
          Text(
            [
              formats.date(item.createdAt),
              if (item.closedAt != null) formats.date(item.closedAt!),
              if (terms != null) terms,
            ].join(' — '),
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
        ],
      ),
    );
  }
}

/// docs/04 §12 timeline of one case.
class CaseHistoryDetailScreen extends ConsumerWidget {
  const CaseHistoryDetailScreen({required this.caseId, super.key});

  final String caseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final access = ref.watch(historyAccessProvider);
    if (!access.isOpen) {
      // The 5-minute window ended: back to the gate.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted && context.canPop()) context.pop();
      });
    }
    final value = ref.watch(caseHistoryDetailProvider(caseId));
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
            semanticLabel: t.t('common.back'), onPressed: () => context.pop()),
        title: Text(t.t('history.detailTitle')),
      ),
      body: AsyncDetailBody<HistoryCaseDetail>(
        value: value,
        t: t,
        onRetry: () => ref.invalidate(caseHistoryDetailProvider(caseId)),
        builder: (d) => ListView(
          padding: kDetailPadding,
          children: [
            Text(d.item.title,
                style: typography.titleLarge.copyWith(color: colors.text)),
            const SizedBox(height: AppSpacing.sm),
            Text(
              '${t.t('history.client')}: ${d.clientName ?? t.t('history.clientHidden')}',
              style: typography.bodySmall.copyWith(color: colors.textSecondary),
            ),
            DetailSection(
              title: t.t('history.timeline'),
              child: Column(
                children: [
                  for (var i = 0; i < d.events.length; i++)
                    AppEntrance(
                      index: i < 10 ? i + 1 : 0,
                      child: _EventRow(
                        event: d.events[i],
                        t: t,
                        formats: formats,
                        last: i == d.events.length - 1,
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow(
      {required this.event,
      required this.t,
      required this.formats,
      required this.last});

  final HistoryEvent event;
  final Translator t;
  final L10nFormats formats;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final title = t.t('history.event.${event.eventType}');
    final actor = t.t('history.actor.${event.actor.name}');
    final extra = [
      if (event.amountCents != null && event.feeType != null)
        CaseFormat.terms(t, formats, event.feeType!, event.amountCents!),
      if (event.roundNo != null && event.roundNo! > 0)
        t.t('cases.timeline.round', {'n': '${event.roundNo}'}),
    ].join(' · ');
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: AppSpacing.xl,
            child: Column(
              children: [
                Container(
                  width: AppSpacing.md,
                  height: AppSpacing.md,
                  margin: const EdgeInsets.only(top: AppSpacing.xs),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: colors.gold, width: 2),
                    color: colors.surface,
                  ),
                ),
                Expanded(
                  child: Container(
                      width: 2,
                      color: last
                          ? Colors.transparent
                          : colors.gold.withValues(alpha: 0.35)),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.lg),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: typography.body.copyWith(
                          color: colors.text, fontWeight: FontWeight.w600)),
                  if (extra.isNotEmpty)
                    Text(extra,
                        style:
                            typography.bodySmall.copyWith(color: colors.text)),
                  Text(
                    '$actor · ${formats.dateTime(event.createdAt)}',
                    style: typography.caption
                        .copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Starts the export, waits for the PDF, opens the 10-minute link. The
/// link consumes the reauth token, so the section locks afterwards.
class _ExportSheet extends ConsumerStatefulWidget {
  const _ExportSheet();

  @override
  ConsumerState<_ExportSheet> createState() => _ExportSheetState();
}

class _ExportSheetState extends ConsumerState<_ExportSheet> {
  static const _poll = Duration(seconds: 3);
  static const _maxPolls = 40;
  String? _error;
  bool _done = false;

  @override
  void initState() {
    super.initState();
    _start();
  }

  /// Sequential polling (never overlapping requests); stops when the
  /// sheet closes. The ready response consumes the reauth token, so the
  /// link opens once and the section locks.
  Future<void> _start() async {
    final t = ref.read(translatorProvider);
    final token = ref.read(historyAccessProvider).token;
    if (token == null) return;
    final repo = ref.read(casesRepositoryProvider);
    final access = ref.read(historyAccessProvider.notifier);
    try {
      final started = await repo.startExport(token);
      for (var i = 0; i < _maxPolls; i++) {
        await Future<void>.delayed(_poll);
        if (!mounted) return;
        final s = await repo.exportStatus(token, started.exportId);
        if (s.status == HistoryExportStatus.ready && s.url != null) {
          access.lock();
          await launchUrl(Uri.parse(s.url!),
              mode: LaunchMode.externalApplication);
          if (mounted) setState(() => _done = true);
          return;
        }
        if (s.status == HistoryExportStatus.failed) break;
      }
      if (mounted) setState(() => _error = t.t('history.pdf.failed'));
    } on Object catch (e) {
      if (_isReauthError(e)) access.lock();
      if (mounted) setState(() => _error = errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final message = _error ??
        (_done ? t.t('history.pdf.ready') : t.t('history.pdf.preparing'));
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.xl,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            const SizedBox(height: AppSpacing.xl),
            if (_error == null && !_done)
              SizedBox.square(
                dimension: AppSizes.iconLg,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: colors.gold),
              )
            else
              AppIconMedallion(
                icon: _error == null
                    ? AppIcons.checkRounded
                    : AppIcons.errorOutlineRounded,
                tone: _error == null
                    ? AppMedallionTone.success
                    : AppMedallionTone.danger,
              ),
            const SizedBox(height: AppSpacing.lg),
            Semantics(
              liveRegion: true,
              child: Text(
                message,
                textAlign: TextAlign.center,
                style: typography.body.copyWith(color: colors.text),
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            AppButton(
              label: t.t('common.close'),
              variant: AppButtonVariant.secondary,
              onPressed: () => Navigator.of(context).pop(),
            ),
          ],
        ),
      ),
    );
  }
}
