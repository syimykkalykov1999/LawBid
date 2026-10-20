import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';

/// OQ-054: a calm note on the client's own case — «Вам ещё нужен адвокат?»
/// with its answers while the question waits, or «Кейс скрыт из ленты ·
/// Вернуть» once the case is paused. Everything follows the app theme: the
/// surface, chip and border tokens; gold only as a small accent.
class CaseStaleBanner extends ConsumerStatefulWidget {
  const CaseStaleBanner({
    required this.caseId,
    required this.paused,
    required this.pending,
    this.canMakeNotUrgent = false,
    this.hidesAt,
    this.archivesAt,
    super.key,
  });

  final String caseId;
  final bool paused;
  final bool pending;

  /// «Сменить на «Не срочно»» is offered (urgent, older than 7 days).
  final bool canMakeNotUrgent;

  /// When the unanswered question hides the case (the server's date).
  final DateTime? hidesAt;

  /// When the paused case moves to the archive.
  final DateTime? archivesAt;

  /// Whether this case needs a banner at all.
  static bool needed({required bool paused, required bool pending}) =>
      paused || pending;

  @override
  ConsumerState<CaseStaleBanner> createState() => _CaseStaleBannerState();
}

class _CaseStaleBannerState extends ConsumerState<CaseStaleBanner> {
  bool _busy = false;

  Future<void> _run(
    Future<void> Function() action,
    String doneKey,
  ) async {
    if (_busy) return;
    setState(() => _busy = true);
    final t = ref.read(translatorProvider);
    // The banner leaves the screen once the case changes: keep the context
    // of the navigator for the snack bar.
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

  Future<void> _answer(StillNeededAnswer answer, String doneKey) => _run(
        () => ref
            .read(caseActionsProvider)
            .answerStillNeeded(widget.caseId, answer),
        doneKey,
      );

  Future<void> _notNeeded() async {
    final t = ref.read(translatorProvider);
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('cases.owner.closeTitle'),
      message: t.t('cases.owner.closeMessage'),
      confirmLabel: t.t('cases.owner.close'),
    );
    if (!ok || !mounted) return;
    await _answer(StillNeededAnswer.notNeeded, 'cases.owner.closed');
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final paused = widget.paused;
    final hidesAt = widget.hidesAt;
    final archivesAt = widget.archivesAt;
    // WHY it appeared and WHEN it acts — with the server's real dates.
    final hint = hidesAt == null
        ? t.t('cases.stale.hint')
        : t.t('cases.stale.hintDate', {'date': formats.dayMonth(hidesAt)});
    final pausedHint = archivesAt == null
        ? t.t('cases.stale.pausedHint')
        : t.t('cases.stale.pausedHintDate', {
            'date': formats.dayMonth(archivesAt),
          });
    return Semantics(
      container: true,
      child: Container(
        key: ValueKey(paused ? 'stale-paused' : 'stale-prompt'),
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: Border.all(color: colors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                AppIcon(
                  paused
                      ? AppIcons.pauseCircleOutlineRounded
                      : AppIcons.hourglassTopRounded,
                  size: AppSizes.iconSm,
                  color: colors.iconTint,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    paused
                        ? t.t('cases.stale.paused')
                        : t.t('cases.stale.title'),
                    style: typography.bodySmall.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            if (paused) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                pausedHint,
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.md),
              _StaleButton(
                key: const ValueKey('stale-resume'),
                label: t.t('cases.stale.resume'),
                emphasized: true,
                onTap: _busy
                    ? null
                    : () => _run(
                          () => ref
                              .read(caseActionsProvider)
                              .resume(widget.caseId),
                          'cases.stale.resumed',
                        ),
              ),
            ],
            if (!paused) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                hint,
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.md),
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.sm,
                children: [
                  _StaleButton(
                    key: const ValueKey('stale-yes'),
                    label: t.t('cases.stale.yes'),
                    emphasized: true,
                    onTap: _busy
                        ? null
                        : () => _answer(
                              StillNeededAnswer.stillNeeded,
                              'cases.stale.answered',
                            ),
                  ),
                  _StaleButton(
                    key: const ValueKey('stale-wait'),
                    label: t.t('cases.stale.wait'),
                    onTap: _busy
                        ? null
                        : () => _answer(
                              StillNeededAnswer.waitBetter,
                              'cases.stale.answered',
                            ),
                  ),
                  _StaleButton(
                    key: const ValueKey('stale-no'),
                    label: t.t('cases.stale.no'),
                    onTap: _busy ? null : _notNeeded,
                  ),
                  if (widget.canMakeNotUrgent)
                    _StaleButton(
                      key: const ValueKey('stale-not-urgent'),
                      label: t.t('cases.stale.notUrgent'),
                      onTap: _busy
                          ? null
                          : () => _answer(
                                StillNeededAnswer.makeNotUrgent,
                                'cases.stale.notUrgentDone',
                              ),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                t.t('cases.stale.answersHint'),
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// A quiet pill button: the first answer sits on the chip tone, the rest on
/// the surface with a hairline; never a gold fill.
class _StaleButton extends StatelessWidget {
  const _StaleButton({
    required this.label,
    required this.onTap,
    this.emphasized = false,
    super.key,
  });

  final String label;
  final VoidCallback? onTap;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: label,
      child: ExcludeSemantics(
        child: AppPressable(
          onTap: onTap,
          child: Container(
            constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: emphasized ? colors.chip : colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.pill),
              border: Border.all(color: colors.border),
            ),
            child: Opacity(
              opacity: onTap == null ? 0.5 : 1,
              child: Text(
                label,
                textAlign: TextAlign.center,
                style: typography.bodySmall.copyWith(
                  color: colors.text,
                  fontWeight: emphasized ? FontWeight.w600 : FontWeight.w500,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
