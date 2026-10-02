// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/verification/application/verification_wizard_controller.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';

/// One document of the request (bar document of a state, a side of the ID,
/// the selfie) with every upload state: empty (dashed drop zone with the
/// source actions), uploading (progress bar + cancel), checking (scan),
/// attached (gold check), failed (reason + Retry / Remove) and infected
/// (blocked, Remove). Rows animate in/out; reduce-motion makes them
/// instant.
class DocumentSlotCard extends StatelessWidget {
  const DocumentSlotCard({
    required this.t,
    required this.title,
    required this.icon,
    required this.documents,
    required this.tasks,
    required this.canAdd,
    required this.canRemoveAttached,
    required this.actions,
    required this.onRemoveAttached,
    required this.onRetry,
    required this.onCancel,
    super.key,
    this.subtitle,
  });

  final Translator t;
  final String title;
  final String? subtitle;
  final IconData icon;
  final List<VerificationDocument> documents;
  final List<UploadTask> tasks;
  final bool canAdd;
  final bool canRemoveAttached;

  /// Source buttons (camera / library / file) shown while [canAdd].
  final List<SlotAction> actions;
  final ValueChanged<VerificationDocument> onRemoveAttached;
  final ValueChanged<UploadTask> onRetry;
  final ValueChanged<UploadTask> onCancel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final done = documents.isNotEmpty && tasks.isEmpty;
    final blocked = tasks.any(
      (u) => u.phase == UploadPhase.failed || u.phase == UploadPhase.infected,
    );
    final duration =
        context.reduceMotion ? Duration.zero : AppMotion.stateChange;

    return AnimatedContainer(
      duration: duration,
      curve: AppMotion.enterCurve,
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(
          color: blocked
              ? colors.danger
              : done
                  ? colors.gold
                  : colors.border,
          width: done || blocked ? 1.5 : 1,
        ),
        boxShadow: [
          BoxShadow(
            color: colors.shadow,
            blurRadius: AppSizes.cardShadowBlur,
            offset: const Offset(0, AppSizes.cardShadowOffsetY),
          ),
        ],
      ),
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              AppIconMedallion(
                icon: done ? AppIcons.checkRounded : icon,
                tone: blocked
                    ? AppMedallionTone.danger
                    : done
                        ? AppMedallionTone.success
                        : AppMedallionTone.gold,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: typography.roleTitle.copyWith(color: colors.text),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: AppSpacing.xs / 2),
                      Text(
                        subtitle!,
                        style: typography.bodySmall
                            .copyWith(color: colors.textSecondary),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
          _MaybeAnimatedSize(
            duration: duration,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final d in documents)
                  _AttachedRow(
                    key: ValueKey('doc-${d.id}'),
                    t: t,
                    onRemove:
                        canRemoveAttached ? () => onRemoveAttached(d) : null,
                  ),
                for (final u in tasks)
                  _TaskRow(
                    key: ValueKey('task-${u.localId}'),
                    t: t,
                    task: u,
                    onRetry: () => onRetry(u),
                    onCancel: () => onCancel(u),
                  ),
              ],
            ),
          ),
          if (canAdd) ...[
            const SizedBox(height: AppSpacing.md),
            _DropZone(
              hint: documents.isEmpty && tasks.isEmpty
                  ? t.t('verification.upload.formats')
                  : null,
              actions: actions,
            ),
          ],
        ],
      ),
    );
  }
}

class SlotAction {
  const SlotAction({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;
}

class _DropZone extends StatelessWidget {
  const _DropZone({required this.hint, required this.actions});

  final String? hint;
  final List<SlotAction> actions;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return CustomPaint(
      painter: _DashedBorder(color: colors.goldStroke.withValues(alpha: 0.55)),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              alignment: WrapAlignment.center,
              children: [
                for (final a in actions)
                  AppChip(
                    label: a.label,
                    height: AppSizes.touchTarget,
                    leading: AppIcon(
                      a.icon,
                      size: AppSizes.iconSm,
                      color: colors.goldDark,
                    ),
                    onTap: a.onTap,
                  ),
              ],
            ),
            if (hint != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                hint!,
                textAlign: TextAlign.center,
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DashedBorder extends CustomPainter {
  _DashedBorder({required this.color});

  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5;
    final path = Path()
      ..addRRect(
        RRect.fromRectAndRadius(
          Offset.zero & size,
          const Radius.circular(AppRadii.field),
        ),
      );
    const dash = AppSpacing.sm - 2;
    const gap = AppSpacing.xs + 1;
    for (final metric in path.computeMetrics()) {
      var d = 0.0;
      while (d < metric.length) {
        canvas.drawPath(metric.extractPath(d, d + dash), paint);
        d += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(_DashedBorder old) => old.color != color;
}

class _AttachedRow extends StatelessWidget {
  const _AttachedRow({required this.t, required this.onRemove, super.key});

  final Translator t;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return AppEntrance(
      child: Padding(
        padding: const EdgeInsets.only(top: AppSpacing.md),
        child: Row(
          children: [
            AppIcon(
              AppIcons.verifiedRounded,
              size: AppSizes.iconSm,
              color: colors.success,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                t.t('verification.upload.attached'),
                style: typography.body.copyWith(color: colors.text),
              ),
            ),
            if (onRemove != null)
              AppIconButton(
                semanticLabel: t.t('verification.upload.remove'),
                onPressed: onRemove,
                icon: AppIcon(
                  AppIcons.deleteOutlineRounded,
                  color: colors.textSecondary,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _TaskRow extends StatelessWidget {
  const _TaskRow({
    required this.t,
    required this.task,
    required this.onRetry,
    required this.onCancel,
    super.key,
  });

  final Translator t;
  final UploadTask task;
  final VoidCallback onRetry;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final duration =
        context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    final failed = task.phase == UploadPhase.failed;
    final infected = task.phase == UploadPhase.infected;
    final status = switch (task.phase) {
      UploadPhase.uploading => t.t('verification.upload.uploading', {
          'percent': '${(task.progress * 100).round()}',
        }),
      UploadPhase.scanning => t.t('verification.upload.scanning'),
      UploadPhase.attaching => t.t('verification.upload.attaching'),
      UploadPhase.infected => t.t('verification.upload.infected'),
      UploadPhase.failed => task.error is ScanTimeoutException
          ? t.t('verification.upload.scanTimeout')
          : '${t.t('verification.upload.failed')} ${errorText(t, task.error ?? '')}',
    };
    return AppEntrance(
      child: Padding(
        padding: const EdgeInsets.only(top: AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                AppIcon(
                  infected
                      ? AppIcons.gppBadOutlined
                      : failed
                          ? AppIcons.errorOutlineRounded
                          : task.document.isPdf
                              ? AppIcons.pictureAsPdfOutlined
                              : AppIcons.imageOutlined,
                  size: AppSizes.iconSm,
                  color:
                      infected || failed ? colors.dangerText : colors.goldDark,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        task.document.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: typography.body.copyWith(color: colors.text),
                      ),
                      Semantics(
                        liveRegion: true,
                        child: Text(
                          status,
                          style: typography.caption.copyWith(
                            color: infected || failed
                                ? colors.dangerText
                                : colors.textSecondary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                if (failed)
                  AppIconButton(
                    semanticLabel: t.t('verification.upload.retry'),
                    onPressed: onRetry,
                    icon: AppIcon(
                      AppIcons.refreshRounded,
                      color: colors.goldDark,
                    ),
                  ),
                AppIconButton(
                  semanticLabel: task.isActive
                      ? t.t('verification.upload.cancel')
                      : t.t('verification.upload.remove'),
                  onPressed: onCancel,
                  icon: AppIcon(
                    task.isActive
                        ? AppIcons.closeRounded
                        : AppIcons.deleteOutlineRounded,
                    color: colors.textSecondary,
                  ),
                ),
              ],
            ),
            if (task.isActive) ...[
              const SizedBox(height: AppSpacing.sm),
              ClipRRect(
                borderRadius: BorderRadius.circular(AppRadii.pill),
                child: task.phase == UploadPhase.uploading
                    ? TweenAnimationBuilder<double>(
                        tween: Tween(end: task.progress),
                        duration: duration,
                        builder: (context, v, _) => LinearProgressIndicator(
                          value: v,
                          minHeight: AppSizes.progressSegment,
                          color: colors.gold,
                          backgroundColor: colors.goldTint,
                        ),
                      )
                    : LinearProgressIndicator(
                        // Scan/attach time is unknown: indeterminate, but a
                        // full static bar under reduce-motion.
                        value: context.reduceMotion ? 1 : null,
                        minHeight: AppSizes.progressSegment,
                        color: colors.gold,
                        backgroundColor: colors.goldTint,
                      ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// AnimatedSize, or the plain child under reduce-motion (a zero-duration
/// AnimatedSize re-dirties its own layout).
class _MaybeAnimatedSize extends StatelessWidget {
  const _MaybeAnimatedSize({required this.duration, required this.child});

  final Duration duration;
  final Widget child;

  @override
  Widget build(BuildContext context) => duration == Duration.zero
      ? child
      : AnimatedSize(
          duration: duration,
          curve: AppMotion.enterCurve,
          alignment: Alignment.topCenter,
          child: child,
        );
}
