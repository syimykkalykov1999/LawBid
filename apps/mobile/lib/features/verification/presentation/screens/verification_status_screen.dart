import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/verification/application/verification_overview_controller.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/presentation/widgets/inline_notice.dart';

/// `/verification` — verification status (docs/03 §8 step 6, §6.1):
/// unverified → what is needed + "Start"; a saved draft → "Continue";
/// pending (submitted / in review) with a timeline; needs_more_info with
/// the verifier's message + "Add information"; rejected with the reason
/// and "Submit a new request"; verified with the blue check. Every
/// docs/01 §8.3 state: skeleton, error + Retry, offline, pull-to-refresh.
class VerificationStatusScreen extends ConsumerWidget {
  const VerificationStatusScreen({super.key});

  Future<void> _openWizard(BuildContext context, WidgetRef ref) async {
    await context.push<void>(AppRoutes.verificationWizard);
    // The draft may have changed (or been submitted) in the wizard.
    ref.invalidate(verificationOverviewProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final async = ref.watch(verificationOverviewProvider);
    final controller = ref.read(verificationOverviewProvider.notifier);
    ref.listen(connectivityStatusProvider, (previous, next) {
      final current = ref.read(verificationOverviewProvider);
      if ((previous?.isOffline ?? false) && next.isOnline && current.hasError) {
        controller.refresh();
      }
    });

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('verification.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: AnimatedSwitcher(
        duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
        child: switch (async) {
          AsyncData(:final value) => KeyedSubtree(
              key: ValueKey('status-${viewOf(value).name}'),
              child: RefreshIndicator(
                color: colors.gold,
                onRefresh: () async {
                  try {
                    await controller.refresh();
                  } on Object catch (e) {
                    if (context.mounted) {
                      showAppSnackBar(context, errorText(t, e));
                    }
                  }
                },
                child: _StatusBody(
                  t: t,
                  overview: value,
                  onOpenWizard: () => _openWizard(context, ref),
                ),
              ),
            ),
          AsyncError(:final error) => KeyedSubtree(
              key: const ValueKey('status-error'),
              child: isOfflineError(error)
                  ? AppOfflineState(
                      title: t.t('offline.title'),
                      message: t.t('offline.message'),
                      action: AppButton(
                        label: t.t('error.retry'),
                        icon: AppIcons.refreshRounded,
                        variant: AppButtonVariant.secondary,
                        height: AppSizes.touchTarget,
                        onPressed: controller.refresh,
                      ),
                    )
                  : AppErrorState(
                      message: t.t('verification.status.error'),
                      retryLabel: t.t('error.retry'),
                      onRetry: controller.refresh,
                    ),
            ),
          _ => const _StatusSkeleton(key: ValueKey('status-loading')),
        },
      ),
    );
  }
}

class _StatusBody extends StatelessWidget {
  const _StatusBody({
    required this.t,
    required this.overview,
    required this.onOpenWizard,
  });

  final Translator t;
  final VerificationOverview overview;
  final VoidCallback onOpenWizard;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final view = viewOf(overview);
    final r = overview.request;
    final children = <Widget>[];

    Widget primary(String label, {IconData? icon, bool enabled = true}) =>
        AppButton(
          label: label,
          icon: icon,
          isEnabled: enabled,
          dimWhenDisabled: true,
          onPressed: enabled ? onOpenWizard : null,
        );

    switch (view) {
      case VerificationView.start:
        children.addAll([
          _Hero(
            badge: const _HeroBadge.gold(AppIcons.verifiedUserOutlined),
            title: t.t('verification.status.start.title'),
            body: t.t('verification.status.start.body'),
          ),
          _NeedList(t: t, identity: overview.identityRequired),
          primary(
            t.t('verification.status.start.cta'),
            icon: AppIcons.arrowForwardRounded,
          ),
        ]);
      case VerificationView.draft:
        final parts = _draftParts(r!, overview.identityRequired);
        children.addAll([
          _Hero(
            badge: const _HeroBadge.gold(AppIcons.editNoteRounded),
            title: t.t('verification.status.draft.title'),
            body: t.t('verification.status.draft.body'),
          ),
          _DraftProgress(t: t, done: parts.$1, total: parts.$2),
          primary(
            t.t('verification.status.draft.cta'),
            icon: AppIcons.arrowForwardRounded,
          ),
        ]);
      case VerificationView.pending:
        children.addAll([
          _Hero(
            badge: const _HeroBadge.gold(AppIcons.hourglassTopRounded),
            title: t.t('verification.status.pending.title'),
            body: t.t('verification.status.pending.body'),
          ),
          _Timeline(t: t, request: r!),
          _Licenses(t: t, licenses: r.licenses),
        ]);
      case VerificationView.needsMoreInfo:
        children.addAll([
          _Hero(
            badge: const _HeroBadge.warning(AppIcons.markEmailUnreadOutlined),
            title: t.t('verification.status.needsInfo.title'),
            body: t.t('verification.status.needsInfo.body'),
          ),
          InlineNotice(
            tone: NoticeTone.warning,
            icon: AppIcons.formatQuoteRounded,
            title: t.t('verification.needsInfo.messageTitle'),
            message: r!.infoRequestMessage ??
                t.t('verification.needsInfo.noMessage'),
          ),
          primary(
            t.t('verification.status.needsInfo.cta'),
            icon: AppIcons.uploadFileRounded,
          ),
          _Licenses(t: t, licenses: r.licenses),
        ]);
      case VerificationView.rejected:
        final code = r!.rejectionCode;
        final limit = overview.submissionLimitReached;
        children.addAll([
          _Hero(
            badge: const _HeroBadge.danger(AppIcons.gppBadOutlined),
            title: t.t('verification.status.rejected.title'),
            body: t.t('verification.status.rejected.body'),
          ),
          InlineNotice(
            tone: NoticeTone.danger,
            icon: AppIcons.infoOutlineRounded,
            title: t.t('verification.status.rejected.reason'),
            message: [
              if (code != null) rejectText(t, code),
              if (r.rejectionReason != null && r.rejectionReason!.isNotEmpty)
                r.rejectionReason!,
            ].join('\n'),
          ),
          _Licenses(t: t, licenses: r.licenses),
          primary(
            t.t('verification.status.rejected.cta'),
            icon: AppIcons.restartAltRounded,
            enabled: !limit,
          ),
          Text(
            t.t(
                limit
                    ? 'verification.status.limitReached'
                    : 'verification.status.submissions',
                {
                  'used': '${overview.submissionsLast30Days}',
                  'max': '${overview.maxSubmissions30Days}',
                }),
            textAlign: TextAlign.center,
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
        ]);
      case VerificationView.verified:
        final open = r != null &&
            (r.status == RequestStatus.submitted ||
                r.status == RequestStatus.inReview ||
                r.status == RequestStatus.needsMoreInfo ||
                r.status == RequestStatus.draft);
        children.addAll([
          _Hero(
            badge: const _HeroBadge.verified(),
            title: t.t('verification.status.verified.title'),
            body: t.t('verification.status.verified.body'),
          ),
          _Licenses(t: t, licenses: r?.licenses ?? const []),
          if (open)
            InlineNotice(
              tone: r.status == RequestStatus.needsMoreInfo
                  ? NoticeTone.warning
                  : NoticeTone.info,
              icon: AppIcons.addLocationAltOutlined,
              title: t.t('verification.status.verified.openRequest'),
              message: r.status == RequestStatus.needsMoreInfo
                  ? (r.infoRequestMessage ??
                      t.t('verification.needsInfo.noMessage'))
                  : t.t(
                      r.status == RequestStatus.draft
                          ? 'verification.status.draft.body'
                          : 'verification.status.pending.body',
                    ),
              action: r.isEditable
                  ? AppButton(
                      label: t.t(
                        r.status == RequestStatus.draft
                            ? 'verification.status.draft.cta'
                            : 'verification.status.needsInfo.cta',
                      ),
                      variant: AppButtonVariant.secondary,
                      height: AppSizes.touchTarget,
                      onPressed: onOpenWizard,
                    )
                  : null,
            )
          else
            AppButton(
              label: t.t('verification.status.verified.addState'),
              icon: AppIcons.addRounded,
              variant: AppButtonVariant.secondary,
              onPressed: onOpenWizard,
            ),
          // docs/03 §8 step 6 / §3.3: verified attorneys pick practices next.
          AppButton(
            label: t.t('verification.status.verified.choosePractices'),
            icon: AppIcons.workOutlineRounded,
            onPressed: () => context.push(AppRoutes.practices),
          ),
        ]);
      case VerificationView.suspended:
        children.add(
          _Hero(
            badge: const _HeroBadge.danger(AppIcons.pauseCircleOutlineRounded),
            title: t.t('verification.status.suspended.title'),
            body: t.t('verification.status.suspended.body'),
          ),
        );
    }

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.lg,
        AppSpacing.screenSide,
        AppSpacing.xxxl,
      ),
      children: staggeredEntrance([
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.lg),
          children[i],
        ],
      ]),
    );
  }

  static (int, int) _draftParts(VerificationRequest r, bool identity) {
    final parts = [
      r.licensesComplete,
      if (identity) ...[r.identityComplete, r.selfieComplete],
    ];
    return (parts.where((p) => p).length, parts.length);
  }
}

/// `verification.reject.<code>` (docs/03 §2.5.4), `other` for unknown codes.
String rejectText(Translator t, String code) {
  const known = {
    'license_not_found',
    'license_inactive',
    'name_mismatch',
    'document_unreadable',
    'document_expired',
    'selfie_mismatch',
    'suspected_fraud',
    'incomplete_submission',
    'other',
  };
  return t.t('verification.reject.${known.contains(code) ? code : 'other'}');
}

class _HeroBadge {
  const _HeroBadge._(this.icon, this.kind);
  const _HeroBadge.gold(IconData icon) : this._(icon, _BadgeKind.gold);
  const _HeroBadge.warning(IconData icon) : this._(icon, _BadgeKind.warning);
  const _HeroBadge.danger(IconData icon) : this._(icon, _BadgeKind.danger);
  const _HeroBadge.verified()
      : this._(AppIcons.verifiedRounded, _BadgeKind.verified);

  final IconData icon;
  final _BadgeKind kind;
}

enum _BadgeKind { gold, warning, danger, verified }

class _Hero extends StatelessWidget {
  const _Hero({required this.badge, required this.title, required this.body});

  final _HeroBadge badge;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final (fill, ring, fg) = switch (badge.kind) {
      _BadgeKind.gold => (colors.goldTint, colors.gold, colors.goldDark),
      _BadgeKind.warning => (colors.goldTint, colors.warning, colors.warning),
      _BadgeKind.danger => (
          colors.dangerTint,
          colors.danger,
          colors.dangerText
        ),
      _BadgeKind.verified => (colors.infoTint, colors.info, colors.info),
    };
    return Stack(
      alignment: Alignment.topCenter,
      children: [
        const Positioned(
          top: 0,
          child: ExcludeSemantics(
            child: WatermarkScales(width: 180, height: 116),
          ),
        ),
        Padding(
          padding: const EdgeInsets.only(top: AppSpacing.lg),
          child: Column(
            children: [
              AppEntrance(
                scale: true,
                child: ExcludeSemantics(
                  child: Container(
                    width: AppSizes.stateMedallion,
                    height: AppSizes.stateMedallion,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: fill,
                      border: Border.all(color: ring, width: 2),
                      boxShadow: [
                        BoxShadow(
                          color: ring.withValues(alpha: 0.25),
                          blurRadius: AppSpacing.xl,
                        ),
                      ],
                    ),
                    child: AppIcon(
                      badge.icon,
                      size: AppSizes.stateIcon + AppSpacing.sm,
                      color: fg,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              Semantics(
                header: true,
                child: Text(
                  title,
                  textAlign: TextAlign.center,
                  style: typography.titleLarge.copyWith(color: colors.text),
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                body,
                textAlign: TextAlign.center,
                style: typography.body.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _NeedList extends StatelessWidget {
  const _NeedList({required this.t, required this.identity});

  final Translator t;
  final bool identity;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final items = [
      (AppIcons.balanceRounded, 'verification.intro.item.license'),
      if (identity) ...[
        (AppIcons.badgeOutlined, 'verification.intro.item.id'),
        (
          AppIcons.faceRetouchingNaturalOutlined,
          'verification.intro.item.selfie'
        ),
      ],
    ];
    return AppCard(
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++) ...[
            if (i > 0) const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                AppIconMedallion(icon: items[i].$1),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    t.t(items[i].$2),
                    style: typography.body.copyWith(color: colors.text),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _DraftProgress extends StatelessWidget {
  const _DraftProgress({
    required this.t,
    required this.done,
    required this.total,
  });

  final Translator t;
  final int done;
  final int total;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final label = t.t('verification.status.draft.progress', {
      'done': '$done',
      'total': '$total',
    });
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: typography.roleTitle.copyWith(color: colors.text)),
          const SizedBox(height: AppSpacing.md),
          AppStepProgress(total: total, current: done, semanticLabel: label),
        ],
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.t, required this.request});

  final Translator t;
  final VerificationRequest request;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final inReview = request.status == RequestStatus.inReview;
    final submitted = request.submittedAt;
    final rows = [
      (
        t.t('verification.timeline.submitted'),
        submitted == null
            ? null
            : MaterialLocalizations.of(context)
                .formatMediumDate(submitted.toLocal()),
        _Mark.done,
      ),
      (
        t.t('verification.timeline.review'),
        inReview ? t.t('verification.timeline.review.now') : null,
        inReview ? _Mark.current : _Mark.next,
      ),
      (t.t('verification.timeline.decision'), null, _Mark.upcoming),
    ];
    return AppCard(
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++)
            MergeSemantics(
              child: IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Column(
                      children: [
                        _TimelineDot(mark: rows[i].$3),
                        if (i < rows.length - 1)
                          Expanded(
                            child: Container(
                              width: 2,
                              margin: const EdgeInsets.symmetric(
                                vertical: AppSpacing.xs,
                              ),
                              color: rows[i].$3 == _Mark.done
                                  ? colors.gold
                                  : colors.border,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(
                          bottom: i < rows.length - 1 ? AppSpacing.lg : 0,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              rows[i].$1,
                              style: typography.roleTitle.copyWith(
                                color: rows[i].$3 == _Mark.upcoming
                                    ? colors.textSecondary
                                    : colors.text,
                              ),
                            ),
                            if (rows[i].$2 != null)
                              Text(
                                rows[i].$2!,
                                style: typography.caption
                                    .copyWith(color: colors.goldDark),
                              ),
                          ],
                        ),
                      ),
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

enum _Mark { done, current, next, upcoming }

class _TimelineDot extends StatelessWidget {
  const _TimelineDot({required this.mark});

  final _Mark mark;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    const size = AppSizes.iconMd;
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: switch (mark) {
            _Mark.done => colors.gold,
            _Mark.current => colors.goldTint,
            _ => colors.surface,
          },
          border: Border.all(
            color: mark == _Mark.upcoming ? colors.border : colors.gold,
            width: 2,
          ),
        ),
        child: mark == _Mark.done
            ? AppIcon(
                AppIcons.checkRounded,
                size: AppSpacing.lg,
                color: colors.navy,
              )
            : mark == _Mark.current
                ? Center(
                    child: Container(
                      width: AppSpacing.sm,
                      height: AppSpacing.sm,
                      decoration: BoxDecoration(
                        color: colors.gold,
                        shape: BoxShape.circle,
                      ),
                    ),
                  )
                : null,
      ),
    );
  }
}

/// The attorney's licenses with their status (bar number is shown to its
/// owner only, docs/03 §6.2).
class _Licenses extends StatelessWidget {
  const _Licenses({required this.t, required this.licenses});

  final Translator t;
  final List<VerificationLicense> licenses;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    if (licenses.isEmpty) return const SizedBox.shrink();
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            t.t('verification.status.licenses'),
            style: typography.caption.copyWith(color: colors.goldDark),
          ),
          for (final l in licenses) ...[
            const SizedBox(height: AppSpacing.md),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppIcon(
                  switch (l.status) {
                    LicenseStatus.verified => AppIcons.verifiedRounded,
                    LicenseStatus.pending => AppIcons.hourglassTopRounded,
                    _ => AppIcons.cancelOutlined,
                  },
                  size: AppSizes.iconSm,
                  color: switch (l.status) {
                    LicenseStatus.verified => colors.info,
                    LicenseStatus.pending => colors.goldDark,
                    _ => colors.dangerText,
                  },
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${l.stateName} · ${l.barNumber}',
                        style: typography.body.copyWith(color: colors.text),
                      ),
                      Text(
                        [
                          t.t('verification.license.status.${l.status.name}'),
                          if (l.rejectionCode != null)
                            rejectText(t, l.rejectionCode!),
                          if (l.rejectionNote != null &&
                              l.rejectionNote!.isNotEmpty)
                            l.rejectionNote!,
                        ].join(' · '),
                        style: typography.caption
                            .copyWith(color: colors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _StatusSkeleton extends StatelessWidget {
  const _StatusSkeleton({super.key});

  @override
  Widget build(BuildContext context) => const Padding(
        padding: EdgeInsets.all(AppSpacing.screenSide),
        child: Column(
          children: [
            SizedBox(height: AppSpacing.xl),
            AppSkeleton(
              width: AppSizes.stateMedallion,
              height: AppSizes.stateMedallion,
              borderRadius: AppSizes.stateMedallion / 2,
            ),
            SizedBox(height: AppSpacing.lg),
            AppSkeleton(width: 220, height: AppSpacing.xl),
            SizedBox(height: AppSpacing.md),
            AppSkeleton(),
            SizedBox(height: AppSpacing.xl),
            AppSkeletonCard(),
          ],
        ),
      );
}
