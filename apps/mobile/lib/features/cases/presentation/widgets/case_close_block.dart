import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_header.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';

/// R-392 (owner 2026-11-04): closing a case in work takes both sides, like
/// ending an Upwork contract. In the case itself, for the client and the
/// hired attorney alike:
/// - in work: «Закрыть кейс» (asks the other side);
/// - I asked: «Ждём подтверждения…» with the auto-close date;
/// - the other side asked: «Подтвердить закрытие» / «Не закрывать».
/// Existing pieces only: [NoticeCard] and [AppButton] (the look stays).
class CaseCloseBlock extends ConsumerStatefulWidget {
  const CaseCloseBlock({
    required this.caseId,
    required this.status,
    required this.isAttorney,
    this.requestedBy,
    this.autoCloseAt,
    this.canAct = true,
    super.key,
  });

  final String caseId;
  final CaseStatus status;

  /// The viewer is the hired attorney (or their assistant).
  final bool isAttorney;

  /// `client` / `attorney`: who asked to close (pending_completion only).
  final String? requestedBy;

  /// When the request closes the case by itself.
  final DateTime? autoCloseAt;

  /// False for an assistant without the "bids" duty: they see the state
  /// but cannot answer.
  final bool canAct;

  /// Whether the block shows anything for [status].
  static bool shown(CaseStatus status) =>
      status == CaseStatus.inProgress || status == CaseStatus.pendingCompletion;

  @override
  ConsumerState<CaseCloseBlock> createState() => _CaseCloseBlockState();
}

class _CaseCloseBlockState extends ConsumerState<CaseCloseBlock> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() action, String doneKey) async {
    if (_busy) return;
    setState(() => _busy = true);
    final t = ref.read(translatorProvider);
    // The block changes once the case does: keep the navigator's context
    // for the snack bar.
    final host = Navigator.of(context).context;
    try {
      await action();
      if (host.mounted) showAppSnackBar(host, t.t(doneKey));
    } on Object catch (e) {
      if (host.mounted) showAppSnackBar(host, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _request() async {
    final t = ref.read(translatorProvider);
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('cases.close.requestTitle'),
      message: t.t('cases.close.requestMessage'),
      confirmLabel: t.t('cases.close.request'),
    );
    if (!ok || !mounted) return;
    await _run(
      () => widget.isAttorney
          ? ref.read(caseActionsProvider).completeAsAttorney(widget.caseId)
          : ref.read(caseActionsProvider).complete(widget.caseId),
      'cases.close.sent',
    );
  }

  Future<void> _confirm() async {
    final t = ref.read(translatorProvider);
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('cases.close.confirmTitle'),
      message: t.t('cases.close.confirmMessage'),
      confirmLabel: t.t('cases.close.confirm'),
    );
    if (!ok || !mounted) return;
    await _run(
      () => ref.read(caseActionsProvider).confirmCompletion(widget.caseId),
      'cases.work.confirmed',
    );
  }

  Future<void> _decline() => _run(
        () => ref.read(caseActionsProvider).declineCompletion(widget.caseId),
        'cases.close.declined',
      );

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final me = widget.isAttorney ? 'attorney' : 'client';
    final date =
        widget.autoCloseAt == null ? '' : formats.date(widget.autoCloseAt!);
    if (widget.status == CaseStatus.inProgress) {
      if (!widget.canAct) return const SizedBox.shrink();
      return AppButton(
        key: const ValueKey('case-close-request'),
        label: t.t('cases.close.request'),
        icon: AppIcons.taskAltRounded,
        variant: AppButtonVariant.secondary,
        isLoading: _busy,
        onPressed: _request,
      );
    }
    if (widget.status != CaseStatus.pendingCompletion) {
      return const SizedBox.shrink();
    }
    final requestedBy = widget.requestedBy;
    if (requestedBy == null) return const SizedBox.shrink();
    if (requestedBy == me) {
      return NoticeCard(
        key: const ValueKey('case-close-waiting'),
        icon: AppIcons.hourglassTopRounded,
        message: t.t('cases.close.waiting', {'date': date}),
      );
    }
    return NoticeCard(
      key: const ValueKey('case-close-asked'),
      icon: AppIcons.taskAltRounded,
      message: t.t(
        requestedBy == 'client'
            ? 'cases.close.askedByClient'
            : 'cases.close.askedByAttorney',
        {'date': date},
      ),
      action: !widget.canAct
          ? null
          : Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AppButton(
                  key: const ValueKey('case-close-confirm'),
                  label: t.t('cases.close.confirm'),
                  isLoading: _busy,
                  onPressed: _confirm,
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  key: const ValueKey('case-close-decline'),
                  label: t.t('cases.close.decline'),
                  variant: AppButtonVariant.secondary,
                  isEnabled: !_busy,
                  onPressed: _decline,
                ),
              ],
            ),
    );
  }
}
