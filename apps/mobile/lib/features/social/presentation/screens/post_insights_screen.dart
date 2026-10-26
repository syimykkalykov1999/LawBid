import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/social/application/post_insights_providers.dart';
import 'package:lawbid/features/social/domain/post_insights_models.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// Owner 2026-10-18 (Instagram Insights): one post's statistics for its
/// author — the post and its date, the big numbers, a chart by day, who was
/// reached (followers / not), the interactions, and the paid promotion's own
/// statistics when the post was promoted. Someone else's post never shows
/// numbers (the server answers 404 too).
class PostInsightsScreen extends ConsumerWidget {
  const PostInsightsScreen({required this.postId, this.post, super.key});

  final String postId;

  /// The post when the caller has it (header, the owner check before any
  /// request); without it the header shows the date only.
  final Post? post;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final p = post;
    Widget body;
    if (p != null && !p.isMine) {
      body = const _Unavailable();
    } else {
      final insights = ref.watch(postInsightsProvider(postId));
      body = insights.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => e is ApiException &&
                (e.statusCode == 404 || e.statusCode == 403)
            ? const _Unavailable()
            : Center(
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.screenSide),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        errorText(t, e),
                        textAlign: TextAlign.center,
                        style: type.body.copyWith(color: colors.textSecondary),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      AppButton(
                        label: t.t('post.insights.retry'),
                        variant: AppButtonVariant.secondary,
                        onPressed: () =>
                            ref.invalidate(postInsightsProvider(postId)),
                      ),
                    ],
                  ),
                ),
              ),
        data: (s) => RefreshIndicator(
          onRefresh: () => ref.refresh(postInsightsProvider(postId).future),
          child: _Body(insights: s, post: p),
        ),
      );
    }
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(title: Text(t.t('post.stats.title'))),
      body: body,
    );
  }
}

class _Unavailable extends ConsumerWidget {
  const _Unavailable();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppIcon(AppIcons.lockOutlineRounded, color: colors.textSecondary),
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('post.insights.unavailable'),
              textAlign: TextAlign.center,
              style: type.body.copyWith(color: colors.textSecondary),
            ),
          ],
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.insights, this.post});

  final PostInsights insights;
  final Post? post;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  InsightsMetric _metric = InsightsMetric.impressions;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final s = widget.insights;
    final post = widget.post;
    final totals = s.totals;
    final isVideo = post?.video != null || totals.views > 0;
    final metrics = [
      InsightsMetric.impressions,
      InsightsMetric.reach,
      if (isVideo) InsightsMetric.views,
      InsightsMetric.interactions,
      InsightsMetric.profileVisits,
    ];
    final metric = metrics.contains(_metric) ? _metric : metrics.first;

    Widget section(String title) => Padding(
          padding: const EdgeInsets.only(
            top: AppSpacing.xl,
            bottom: AppSpacing.sm,
          ),
          child: Text(
            title,
            style: type.body.copyWith(
              color: colors.text,
              fontWeight: FontWeight.w700,
            ),
          ),
        );

    Widget row(String label, int value, {bool strong = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: (strong ? type.body : type.bodySmall).copyWith(
                    color: strong ? colors.text : colors.textSecondary,
                    fontWeight: strong ? FontWeight.w600 : null,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                f.number(value),
                style: (strong ? type.body : type.bodySmall).copyWith(
                  color: colors.text,
                  fontWeight: strong ? FontWeight.w700 : FontWeight.w600,
                ),
              ),
            ],
          ),
        );

    final bigNumbers = [
      (AppIcons.favoriteBorderRounded, totals.likes, 'post.stats.likes'),
      (
        AppIcons.chatBubbleOutlineRounded,
        totals.comments,
        'post.stats.comments',
      ),
      (AppIcons.autoModeRounded, totals.reposts, 'post.stats.reposts'),
      (AppIcons.sendOutlined, totals.shares, 'post.insights.shares'),
      (AppIcons.bookmarkBorderRounded, totals.saves, 'post.insights.saves'),
    ];

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.xl + MediaQuery.paddingOf(context).bottom,
      ),
      children: [
        _Header(post: post, publishedAt: s.publishedAt),
        const SizedBox(height: AppSpacing.lg),
        Row(
          children: [
            for (final (icon, n, key) in bigNumbers)
              Expanded(
                child: Semantics(
                  label: '${t.t(key)}: ${f.number(n)}',
                  excludeSemantics: true,
                  child: Column(
                    children: [
                      AppIcon(icon, color: colors.text),
                      const SizedBox(height: AppSpacing.xs),
                      FitText(
                        f.number(n),
                        style: type.titleMedium.copyWith(
                          color: colors.text,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
        section(t.t('post.insights.overview')),
        row(t.t('post.insights.reach'), totals.reach, strong: true),
        row(t.t('post.insights.impressions'), totals.impressions),
        if (isVideo) row(t.t('post.insights.views'), totals.views),
        row(t.t('post.insights.interactions'), totals.interactions),
        row(t.t('post.insights.profileVisits'), totals.profileVisits),
        section(t.t('post.insights.byDay')),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final m in metrics)
              AppChip(
                key: ValueKey('insights-metric-${m.name}'),
                label: t.t(_metricKey(m)),
                selected: m == metric,
                onTap: () => setState(() => _metric = m),
              ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        _DayChart(days: s.days, metric: metric),
        section(t.t('post.insights.audience')),
        _ReachSplit(
          followers: s.reachFollowers,
          nonFollowers: s.reachNonFollowers,
        ),
        section(t.t('post.insights.interactions')),
        row(t.t('post.stats.likes'), totals.likes),
        row(t.t('post.stats.comments'), totals.comments),
        row(t.t('post.insights.saves'), totals.saves),
        row(t.t('post.stats.reposts'), totals.reposts),
        row(t.t('post.insights.shares'), totals.shares),
        _PromotionSection(postId: s.postId),
        const SizedBox(height: AppSpacing.lg),
        Row(
          children: [
            AppIcon(
              AppIcons.lockOutlineRounded,
              size: 14,
              color: colors.textSecondary,
            ),
            const SizedBox(width: AppSpacing.xs),
            Expanded(
              child: Text(
                t.t('post.insights.onlyYou'),
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

String _metricKey(InsightsMetric m) => switch (m) {
      InsightsMetric.impressions => 'post.insights.impressions',
      InsightsMetric.reach => 'post.insights.reach',
      InsightsMetric.views => 'post.insights.views',
      InsightsMetric.interactions => 'post.insights.interactions',
      InsightsMetric.profileVisits => 'post.insights.profileVisits',
    };

class _Header extends ConsumerWidget {
  const _Header({required this.publishedAt, this.post});

  final Post? post;
  final DateTime publishedAt;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final p = post;
    final thumb = p == null
        ? null
        : p.media.isNotEmpty
            ? p.media.first.previewUrl
            : p.video?.thumbnailUrl;
    final text = p == null
        ? ''
        : ((p.title ?? '').trim().isNotEmpty ? p.title! : p.body).trim();
    const size = 64.0;
    final placeholder = ColoredBox(
      color: colors.chip,
      child: Center(
        child: AppIcon(
          p?.video != null
              ? AppIcons.playArrowRounded
              : AppIcons.articleOutlined,
          color: colors.textSecondary,
        ),
      ),
    );
    return Row(
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(AppRadii.card),
          child: SizedBox.square(
            dimension: size,
            child: thumb == null || thumb.isEmpty
                ? placeholder
                : CachedNetworkImage(
                    imageUrl: thumb,
                    cacheManager: AppImageCaches.feed,
                    fit: BoxFit.cover,
                    memCacheWidth: 200,
                    placeholder: (_, __) =>
                        ColoredBox(color: colors.skeletonBase),
                    errorWidget: (_, __, ___) => placeholder,
                  ),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (text.isNotEmpty) ...[
                Text(
                  text,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: type.body.copyWith(color: colors.text),
                ),
                const SizedBox(height: 2),
              ],
              Text(
                t.t('post.insights.published', {
                  'date': f.dateTime(publishedAt),
                }),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// Bars by day, drawn with the theme's own colours (no chart package).
class _DayChart extends ConsumerWidget {
  const _DayChart({required this.days, required this.metric});

  final List<InsightsDay> days;
  final InsightsMetric metric;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final values = [for (final d in days) d.counts.of(metric)];
    final total = values.fold<int>(0, (a, b) => a + b);
    final peak = values.fold<int>(0, math.max);
    final caption = type.caption.copyWith(color: colors.textSecondary);
    if (days.isEmpty) return const SizedBox.shrink();
    return Semantics(
      label: '${t.t(_metricKey(metric))}: ${f.number(total)}',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  t.t('post.insights.range', {
                    'from': f.dayMonth(days.first.date),
                    'to': f.dayMonth(days.last.date),
                  }),
                  style: caption,
                ),
              ),
              Text(
                f.number(total),
                style: type.body.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          SizedBox(
            height: 132,
            child: Stack(
              children: [
                Positioned.fill(
                  child: CustomPaint(
                    key: const ValueKey('insights-chart'),
                    painter: _BarsPainter(
                      values: values,
                      bar: colors.accent,
                      track: colors.chip,
                      line: colors.border,
                    ),
                  ),
                ),
                if (peak > 0)
                  PositionedDirectional(
                    top: 0,
                    end: 0,
                    child: Text(f.number(peak), style: caption),
                  ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Row(
            children: [
              Text(f.dayMonth(days.first.date), style: caption),
              const Spacer(),
              if (days.length > 1)
                Text(f.dayMonth(days.last.date), style: caption),
            ],
          ),
          if (total == 0) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(t.t('post.insights.noData'), style: caption),
          ],
        ],
      ),
    );
  }
}

class _BarsPainter extends CustomPainter {
  _BarsPainter({
    required this.values,
    required this.bar,
    required this.track,
    required this.line,
  });

  final List<int> values;
  final Color bar;
  final Color track;
  final Color line;

  @override
  void paint(Canvas canvas, Size size) {
    if (values.isEmpty) return;
    const top = 18.0; // room for the peak label
    final h = size.height - top;
    final peak = values.fold<int>(0, math.max);
    final slot = size.width / values.length;
    final gap = math.min(4, slot * 0.25).toDouble();
    final w = math.max(1, slot - gap).toDouble();
    final base = Paint()
      ..color = line
      ..strokeWidth = 1;
    canvas.drawLine(
      Offset(0, size.height - 0.5),
      Offset(size.width, size.height - 0.5),
      base,
    );
    final fill = Paint()..color = bar;
    final empty = Paint()..color = track;
    for (var i = 0; i < values.length; i++) {
      final x = i * slot + gap / 2;
      final v = values[i];
      final bh = peak == 0 || v == 0 ? 3.0 : math.max(3, h * v / peak);
      final r = RRect.fromRectAndCorners(
        Rect.fromLTWH(x, size.height - bh, w, bh.toDouble()),
        topLeft: const Radius.circular(3),
        topRight: const Radius.circular(3),
      );
      canvas.drawRRect(r, v == 0 ? empty : fill);
    }
  }

  @override
  bool shouldRepaint(_BarsPainter old) =>
      old.bar != bar ||
      old.track != track ||
      old.line != line ||
      !_same(old.values, values);

  static bool _same(List<int> a, List<int> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}

/// Accounts reached: followers / non-followers.
class _ReachSplit extends ConsumerWidget {
  const _ReachSplit({required this.followers, required this.nonFollowers});

  final int followers;
  final int nonFollowers;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final all = followers + nonFollowers;
    final share = all == 0 ? 0.0 : followers / all;
    String pct(double x) => '${f.digits((x * 100).round())}%';
    Widget legend(Color c, String label, int n, double x) => Row(
          children: [
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(
                color: c,
                borderRadius: BorderRadius.circular(AppRadii.pill),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                label,
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
            ),
            Text(
              all == 0 ? f.number(n) : '${f.number(n)} · ${pct(x)}',
              style: type.bodySmall.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(AppRadii.pill),
          child: SizedBox(
            height: 10,
            child: Row(
              children: [
                if (followers > 0)
                  Expanded(
                    flex: math.max(1, (share * 1000).round()),
                    child: ColoredBox(color: colors.accent),
                  ),
                if (nonFollowers > 0 || all == 0)
                  Expanded(
                    flex: math.max(1, ((1 - share) * 1000).round()),
                    child: ColoredBox(color: colors.chip),
                  ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        legend(colors.accent, t.t('post.insights.followers'), followers, share),
        const SizedBox(height: AppSpacing.xs),
        legend(
          colors.chip,
          t.t('post.insights.nonFollowers'),
          nonFollowers,
          1 - share,
        ),
      ],
    );
  }
}

/// «Продвижение»: the paid promotion's own statistics (reach, clicks,
/// spend) when this post was promoted.
class _PromotionSection extends ConsumerWidget {
  const _PromotionSection({required this.postId});

  final String postId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final p = ref.watch(postPromotionProvider(postId)).value?.promotion;
    if (p == null ||
        p.id.isEmpty ||
        p.status == PromotionStatus.pendingPayment) {
      return const SizedBox.shrink();
    }
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xl),
      child: Container(
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: Border.all(color: colors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                AppIcon(AppIcons.campaignOutlined, color: colors.text),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    t.t('post.insights.promotion'),
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('post.insights.promotionHint'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t('post.insights.promotionOpen'),
              variant: AppButtonVariant.secondary,
              onPressed: () async {
                await context.push<void>(AppRoutes.promotionStats(p.id));
                ref
                  ..invalidate(postPromotionProvider(postId))
                  ..invalidate(myPromotionsProvider);
              },
            ),
          ],
        ),
      ),
    );
  }
}
