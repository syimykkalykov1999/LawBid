import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/review_widgets.dart';
import 'package:lawbid/features/profile/presentation/widgets/star_rating.dart';

/// docs/03 §7.2: review text is optional, up to 1000 characters.
const kReviewBodyMax = 1000;

/// Review form (docs/03 §7): 1–5 stars (required), text ≤ 1000, the
/// mandatory notice "A review can't be deleted; you can edit it within 14
/// days" (§8). Creating = `POST /cases/:caseId/review` (Idempotency-Key);
/// once published the screen shows the review as others see it ("Anna
/// K.") with Edit while the 14-day window is open (`PATCH /reviews/:id`).
///
/// Opened without [existing] (a deep link, a notification) the screen first
/// loads the client's review of the case (`GET /cases/:caseId/review`), so
/// an already published review opens for editing instead of a blank form.
class ReviewFormScreen extends ConsumerWidget {
  const ReviewFormScreen({required this.caseId, super.key, this.existing});

  final String caseId;

  /// The client's published review of this case, to edit.
  final Review? existing;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final known = existing;
    if (known != null) return _ReviewForm(caseId: caseId, existing: known);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final own = ref.watch(ownCaseReviewProvider(caseId));
    void retry() => ref.invalidate(ownCaseReviewProvider(caseId));
    Widget frame(Widget body) => Scaffold(
          backgroundColor: colors.bg,
          appBar: AppTopBar(
            title: Text(t.t('reviews.form.title')),
            leading: AppBackButton(
              semanticLabel: t.t('common.back'),
              onPressed: () => Navigator.of(context).maybePop(),
            ),
          ),
          body: SafeArea(top: false, child: body),
        );
    return own.when(
      skipLoadingOnReload: false,
      loading: () => frame(
        ListView(
          key: const ValueKey('review-loading'),
          physics: const NeverScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.lg,
            AppSpacing.screenSide,
            AppSpacing.xxl,
          ),
          children: const [
            AppSkeletonCard(),
            SizedBox(height: AppSpacing.lg),
            AppSkeleton(height: 120, borderRadius: AppRadii.field),
          ],
        ),
      ),
      error: (error, _) => frame(
        isOfflineError(error)
            ? AppOfflineState(
                title: t.t('offline.title'),
                message: t.t('offline.message'),
                action: AppButton(
                  label: t.t('error.retry'),
                  icon: AppIcons.refreshRounded,
                  variant: AppButtonVariant.secondary,
                  height: AppSizes.touchTarget,
                  onPressed: retry,
                ),
              )
            : AppErrorState(
                message: errorText(t, error),
                retryLabel: t.t('error.retry'),
                onRetry: retry,
              ),
      ),
      data: (review) => _ReviewForm(
        key: ValueKey('review-form-${review?.id}'),
        caseId: caseId,
        existing: review,
      ),
    );
  }
}

class _ReviewForm extends ConsumerStatefulWidget {
  const _ReviewForm({required this.caseId, super.key, this.existing});

  final String caseId;
  final Review? existing;

  @override
  ConsumerState<_ReviewForm> createState() => _ReviewFormState();
}

class _ReviewFormState extends ConsumerState<_ReviewForm> {
  late Review? _review = widget.existing;
  late bool _editing = widget.existing == null;
  late int _rating = widget.existing?.rating ?? 0;
  late final _body = TextEditingController(text: widget.existing?.body ?? '');
  bool _submitting = false;
  bool _attempted = false;
  Object? _error;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  Future<void> _submit(Translator t) async {
    setState(() => _attempted = true);
    if (_rating == 0 || _submitting) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    final repo = ref.read(reviewsRepositoryProvider);
    try {
      final existing = _review;
      final saved = existing == null
          ? await repo.create(widget.caseId, rating: _rating, body: _body.text)
          : await repo.update(existing.id, rating: _rating, body: _body.text);
      if (!mounted) return;
      setState(() {
        _review = saved;
        _editing = false;
      });
      showAppSnackBar(
        context,
        t.t(
          existing == null ? 'reviews.form.published' : 'reviews.form.updated',
        ),
      );
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final now = ref.watch(clockProvider)();
    final review = _review;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(
          t.t(
            review == null ? 'reviews.form.title' : 'reviews.form.titleYours',
          ),
        ),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: AnimatedSwitcher(
          duration: context.reduceMotion ? Duration.zero : AppMotion.stepSwitch,
          switchInCurve: AppMotion.enterCurve,
          child: _editing || review == null
              ? _Compose(
                  key: const ValueKey('compose'),
                  t: t,
                  rating: _rating,
                  body: _body,
                  submitting: _submitting,
                  showRatingError: _attempted && _rating == 0,
                  error: _error,
                  isEdit: review != null,
                  onRating: (v) => setState(() => _rating = v),
                  onSubmit: () => _submit(t),
                  onCancel: review == null
                      ? null
                      : () => setState(() {
                            _editing = false;
                            _rating = review.rating;
                            _body.text = review.body ?? '';
                            _error = null;
                          }),
                )
              : _Published(
                  key: ValueKey('published-${review.id}-${review.editedAt}'),
                  t: t,
                  formats: formats,
                  review: review,
                  canEdit: review.canEdit(now),
                  onEdit: () => setState(() => _editing = true),
                ),
        ),
      ),
    );
  }
}

class _Compose extends StatelessWidget {
  const _Compose({
    required this.t,
    required this.rating,
    required this.body,
    required this.submitting,
    required this.showRatingError,
    required this.error,
    required this.isEdit,
    required this.onRating,
    required this.onSubmit,
    super.key,
    this.onCancel,
  });

  final Translator t;
  final int rating;
  final TextEditingController body;
  final bool submitting;
  final bool showRatingError;
  final Object? error;
  final bool isEdit;
  final ValueChanged<int> onRating;
  final VoidCallback onSubmit;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final children = <Widget>[
      AppCard(
        elevated: true,
        child: Column(
          children: [
            const AppIconMedallion(icon: AppIcons.balanceRounded),
            const SizedBox(height: AppSpacing.md),
            Semantics(
              header: true,
              child: Text(
                t.t('reviews.form.question'),
                textAlign: TextAlign.center,
                style: typography.titleWelcome.copyWith(color: colors.text),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            StarRatingInput(
              value: rating,
              enabled: !submitting,
              onChanged: onRating,
              starLabel: (n) => t.t('reviews.stars.label', {'rating': '$n'}),
            ),
            const SizedBox(height: AppSpacing.xs),
            AnimatedSwitcher(
              duration:
                  context.reduceMotion ? Duration.zero : AppMotion.stateChange,
              child: Text(
                showRatingError
                    ? t.t('reviews.form.ratingRequired')
                    : (rating == 0
                        ? t.t('reviews.form.tapToRate')
                        : t.t('reviews.form.rating.$rating')),
                key: ValueKey('rating-caption-$rating-$showRatingError'),
                style: typography.bodySmall.copyWith(
                  color: showRatingError
                      ? colors.dangerText
                      : colors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
      AppTextField(
        key: const ValueKey('review-body'),
        controller: body,
        label: t.t('reviews.form.body'),
        hintText: t.t('reviews.form.bodyHint'),
        helperText: t.t('common.optional'),
        maxLines: 6,
        maxLength: kReviewBodyMax,
        enabled: !submitting,
        inputFormatters: [LengthLimitingTextInputFormatter(kReviewBodyMax)],
        textCapitalization: TextCapitalization.sentences,
      ),
      Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: colors.goldTint,
          borderRadius: BorderRadius.circular(AppRadii.field),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppIcon(
              AppIcons.infoOutlineRounded,
              size: AppSizes.iconSm,
              color: colors.goldStroke,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                t.t('reviews.form.notice'),
                style: typography.bodySmall.copyWith(color: colors.text),
              ),
            ),
          ],
        ),
      ),
      if (error != null)
        Semantics(
          liveRegion: true,
          child: Container(
            key: const ValueKey('review-error'),
            padding: const EdgeInsets.all(AppSpacing.md),
            decoration: BoxDecoration(
              color: colors.dangerTint,
              borderRadius: BorderRadius.circular(AppRadii.field),
            ),
            child: Row(
              children: [
                AppIcon(
                  isOfflineError(error)
                      ? AppIcons.wifiOffRounded
                      : AppIcons.errorOutlineRounded,
                  size: AppSizes.iconSm,
                  color: colors.danger,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    errorText(t, error!),
                    style: typography.bodySmall.copyWith(color: colors.text),
                  ),
                ),
              ],
            ),
          ),
        ),
      AppButton(
        key: const ValueKey('review-submit'),
        label: t.t(isEdit ? 'reviews.form.saveEdit' : 'reviews.form.submit'),
        isLoading: submitting,
        onPressed: onSubmit,
      ),
      if (onCancel != null)
        AppButton(
          label: t.t('common.cancel'),
          variant: AppButtonVariant.secondary,
          height: AppSizes.touchTarget,
          onPressed: submitting ? null : onCancel,
        ),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.sm,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.lg),
          AppEntrance(index: i, child: children[i]),
        ],
      ],
    );
  }
}

class _Published extends StatelessWidget {
  const _Published({
    required this.t,
    required this.formats,
    required this.review,
    required this.canEdit,
    required this.onEdit,
    super.key,
  });

  final Translator t;
  final L10nFormats formats;
  final Review review;
  final bool canEdit;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final children = <Widget>[
      Row(
        children: [
          AppIcon(
            AppIcons.checkCircleRounded,
            color: colors.success,
            size: AppSizes.iconMd,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              t.t('reviews.form.publishedHeading'),
              style: typography.roleTitle.copyWith(color: colors.text),
            ),
          ),
        ],
      ),
      Text(
        t.t('reviews.form.previewHint'),
        style: typography.bodySmall.copyWith(color: colors.textSecondary),
      ),
      ReviewCard(review: review),
      // Audit 2026-10-02: the server lets the author edit any time (owner
      // 2026-10-01, Google-Maps reviews) — no "editable until" date.
      if (canEdit) ...[
        AppButton(
          key: const ValueKey('review-edit'),
          label: t.t('reviews.form.edit'),
          icon: AppIcons.editOutlined,
          variant: AppButtonVariant.secondary,
          onPressed: onEdit,
        ),
      ] else
        Text(
          t.t('reviews.form.locked'),
          key: const ValueKey('review-locked'),
          style: typography.bodySmall.copyWith(color: colors.textSecondary),
        ),
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.lg,
        AppSpacing.screenSide,
        AppSpacing.xxl,
      ),
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.md),
          AppEntrance(index: i, child: children[i]),
        ],
      ],
    );
  }
}
