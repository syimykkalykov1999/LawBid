import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';
import 'package:lawbid/features/profile/presentation/widgets/review_widgets.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/features/social/social_routes.dart';
import 'package:lawbid/features/chat/chat_routes.dart';

enum AttorneyProfileTab { posts, reviews }

/// Public link of an attorney profile (docs/03 §4.2 «Поделиться», deep
/// link of docs/01 §12).
String attorneyShareLink(String host, String username) => 'https://$host/lawyer/$username';

/// docs/03 §4.2 attorney profile, top to bottom: header (photo, @username
/// + blue check, counters) → gold rating card → "Attorney" chip + bio →
/// chip rows (firm, practices, licensed states) → buttons → Posts /
/// Reviews tabs. The same view serves the caller's own profile ([profile]
/// `.isSelf`: Edit + Share) and anyone else's (Follow + Message + Share;
/// "Message" opens the Chats screen — chats start from a case, docs/04 §9).
class AttorneyProfileView extends ConsumerStatefulWidget {
  const AttorneyProfileView({
    required this.profile,
    required this.onRefresh,
    super.key,
    this.needsVerification = false,
    this.initialTab = AttorneyProfileTab.posts,
  });

  final PublicAttorneyProfile profile;
  final Future<void> Function() onRefresh;

  /// Own profile of an attorney who is not verified yet: shows the
  /// "Complete verification" banner.
  final bool needsVerification;
  final AttorneyProfileTab initialTab;

  @override
  ConsumerState<AttorneyProfileView> createState() => _AttorneyProfileViewState();
}

class _AttorneyProfileViewState extends ConsumerState<AttorneyProfileView> {
  late AttorneyProfileTab _tab = widget.initialTab;

  /// Reviews tab: star filter (null = all) and date order.
  int? _stars;
  ReviewsSort _sort = ReviewsSort.newest;

  PublicAttorneyProfile get p => widget.profile;
  ReviewsKey get _reviewsKey => (attorneyId: p.id, rating: _stars, sort: _sort);

  Future<void> _report(Translator t, Review review) async {
    final reason = await showReportReasonSheet(context, t);
    if (reason == null || !mounted) return;
    try {
      await ref.read(reviewsRepositoryProvider).report(review.id, reason);
      if (mounted) showAppSnackBar(context, t.t('reviews.report.sent'));
    } catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _share(Translator t) async {
    final host = ref.read(appEnvironmentProvider).deepLinkHost;
    await Clipboard.setData(ClipboardData(text: attorneyShareLink(host, p.username)));
    if (mounted) showAppSnackBar(context, t.t('profile.share.copied'));
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final reviewsTab = _tab == AttorneyProfileTab.reviews;
    final reviews = reviewsTab ? ref.watch(reviewsListProvider(_reviewsKey)) : null;
    final summary = reviewsTab ? ref.watch(reviewSummaryProvider(p.id)) : null;
    final state = reviews?.value;

    final header = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: staggeredEntrance([
        if (widget.needsVerification) ...[
          _VerificationBanner(t: t),
          const SizedBox(height: AppSpacing.md),
        ],
        // Instagram-like: avatar + counters (posts, followers, following,
        // ★ rating → reviews), name, bio, info chips, one compact button
        // row, icon tabs (owner request 2026-09-28).
        _HeaderCard(profile: p),
        const SizedBox(height: AppSpacing.md),
        _AboutSection(
          profile: p,
          onRating: () => setState(() => _tab = AttorneyProfileTab.reviews),
        ),
        const SizedBox(height: AppSpacing.md),
        _ChipRows(profile: p),
        const SizedBox(height: AppSpacing.sm),
        // Instagram order: buttons right above the tabs — Follow |
        // Message | share icon (owner request).
        _Actions(
          isSelf: p.isSelf,
          attorneyId: p.id,
          isFollowing: p.isFollowing,
          // Owner decision (OQ-014): "Написать" leads to the Chats screen;
          // chats themselves open from a case (docs/04 §9).
          onMessage: () => context.push(ChatRoutes.inbox),
          onShare: () => _share(t),
        ),
        const SizedBox(height: AppSpacing.md),
        _Tabs(
          selected: _tab,
          onChanged: (tab) => setState(() => _tab = tab),
        ),
        const SizedBox(height: AppSpacing.lg),
        if (reviewsTab && summary != null)
          summary.when(
            skipLoadingOnReload: true,
            loading: () => const AppSkeleton(height: AppSizes.stateMedallion + AppSpacing.xxl, borderRadius: AppRadii.card),
            error: (_, __) => const SizedBox.shrink(),
            // No reviews: the tab's "New — no reviews" state says it all.
            data: (s) => s.isNew
                ? const SizedBox.shrink()
                : Padding(
                    padding: const EdgeInsets.only(bottom: AppSpacing.md),
                    child: ReviewSummaryPanel(
                      summary: s,
                      selectedStars: _stars,
                      sort: _sort,
                      // Tap a bar → only those reviews; tap again → all.
                      onStarsTap: (stars) => setState(() => _stars = _stars == stars ? null : stars),
                      onSort: (v) => setState(() => _sort = v),
                    ),
                  ),
          ),
      ]),
    );

    // Footer: posts placeholder (file 05), the reviews tab's own
    // loading/error/empty ("New — no reviews") states.
    Widget? footer;
    var status = AppPaginationStatus.idle;
    var items = const <Review>[];
    if (!reviewsTab) {
      // docs/05: the attorney's posts as a grid (text posts as tiles).
      footer = ProfilePostsGrid(
        attorneyId: p.id,
        emptyTitle: t.t('profile.posts.empty.title'),
        emptyMessage: t.t(p.isSelf ? 'profile.posts.empty.self' : 'profile.posts.empty.other'),
      );
    } else if (reviews == null || reviews.isLoading && state == null) {
      footer = const Column(
        children: [ReviewCardSkeleton(), SizedBox(height: AppSpacing.md), ReviewCardSkeleton()],
      );
    } else if (reviews.hasError && state == null) {
      final offline = isOfflineError(reviews.error);
      footer = _TabMessage(
        icon: offline ? Icons.wifi_off_rounded : Icons.error_outline_rounded,
        title: t.t(offline ? 'offline.title' : 'error.default.title'),
        message: t.t(offline ? 'offline.message' : 'reviews.error'),
        actionLabel: t.t('error.retry'),
        onAction: () => ref.invalidate(reviewsListProvider(_reviewsKey)),
      );
    } else if (state != null && state.items.isEmpty) {
      footer = _stars != null
          ? _TabMessage(
              icon: Icons.star_outline_rounded,
              title: t.t('reviews.filter.emptyTitle', {'stars': '$_stars'}),
              message: t.t('reviews.filter.emptyMessage'),
              actionLabel: t.t('reviews.filter.showAll'),
              onAction: () => setState(() => _stars = null),
            )
          : _TabMessage(
              icon: Icons.star_outline_rounded,
              title: t.t('profile.rating.new'),
              message: t.t(p.isSelf ? 'reviews.empty.self' : 'reviews.empty.other'),
            );
    } else if (state != null) {
      items = state.items;
      status = state.status;
    }

    return AppPaginatedListView<Review>(
      items: items,
      itemKey: (r) => r.id,
      status: status,
      header: header,
      footer: footer,
      labels: AppPaginationLabels(
        loadingMore: t.t('pagination.loadingMore'),
        error: t.t('pagination.error'),
        retry: t.t('error.retry'),
        end: t.t('reviews.end'),
      ),
      // Only the Reviews tab paginates; the posts placeholder must not
      // wake the (autoDispose) reviews list.
      onLoadMore: () {
        if (reviewsTab) ref.read(reviewsListProvider(_reviewsKey).notifier).loadMore();
      },
      onRetry: () {
        if (reviewsTab) ref.read(reviewsListProvider(_reviewsKey).notifier).loadMore();
      },
      onRefresh: () async {
        ref
          ..invalidate(reviewSummaryProvider(p.id))
          ..invalidate(reviewsListProvider(_reviewsKey));
        await widget.onRefresh();
      },
      itemBuilder: (context, review, index) => AppEntrance(
        index: index % 6,
        child: ReviewCard(
          review: review,
          onReport: p.isSelf ? () => _report(t, review) : null,
        ),
      ),
    );
  }
}

class _VerificationBanner extends StatelessWidget {
  const _VerificationBanner({required this.t});

  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: '${t.t('gate.verify.title')}. ${t.t('profile.verifyBanner.body')}',
      excludeSemantics: true,
      child: AppCard(
        onTap: () => context.push(AppRoutes.verification),
        child: Row(
          children: [
            const AppIconMedallion(icon: Icons.verified_user_outlined),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(t.t('gate.verify.title'), style: typography.roleTitle.copyWith(color: colors.text)),
                  Text(
                    t.t('profile.verifyBanner.body'),
                    style: typography.bodySmall.copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: colors.textSecondary),
          ],
        ),
      ),
    );
  }
}

class _HeaderCard extends ConsumerWidget {
  const _HeaderCard({required this.profile});

  final PublicAttorneyProfile profile;

  static const _avatar = 88.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    return Row(
      children: [
        // Thin gold ring for verified attorneys (the brand accent).
        Container(
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: profile.verifiedBadge
                ? LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [colors.goldLight, colors.gold, colors.goldDark],
                  )
                : null,
            color: profile.verifiedBadge ? null : colors.border,
          ),
          child: DecoratedBox(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: colors.bg, width: 2),
            ),
            child: ProfileAvatar(
              size: _avatar,
              url: profile.avatarUrl,
              initials: initialsOf(profile.firstName, profile.lastName, fallback: profile.username),
              heroTag: attorneyAvatarHeroTag(profile.username),
              semanticLabel: t.t('profile.avatar.label'),
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Row(
            children: [
              _Counter(value: formats.number(profile.counters.posts), label: t.t('profile.counters.posts')),
              _Counter(
                value: formats.number(profile.counters.followers),
                label: t.t('profile.counters.followers'),
                onTap: () => context.push(SocialRoutes.followers(profile.id)),
              ),
              _Counter(
                value: formats.number(profile.counters.following),
                label: t.t('profile.counters.following'),
                onTap: () => context.push(SocialRoutes.following(profile.id)),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _Counter extends StatelessWidget {
  const _Counter({required this.value, required this.label, this.onTap, this.star = false});

  final String value;
  final String label;

  /// Followers / following open their lists (docs/05 §6.2); rating opens
  /// the Reviews tab.
  final VoidCallback? onTap;

  /// The rating counter: a gold star before the number.
  final bool star;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final tap = onTap;
    return Expanded(
      child: Semantics(
        label: '$value $label',
        button: tap != null,
        excludeSemantics: true,
        child: AppPressable(
          onTap: tap ?? () {},
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (star) ...[
                      Icon(Icons.star_rounded, size: 16, color: colors.gold),
                      const SizedBox(width: 2),
                    ],
                    Flexible(
                      child: Text(
                        value,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: typography.body.copyWith(color: colors.text, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: typography.caption.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _AboutSection extends ConsumerWidget {
  const _AboutSection({required this.profile, required this.onRating});

  final PublicAttorneyProfile profile;
  final VoidCallback onRating;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final bio = profile.bio?.trim();
    final r = profile.rating;
    final name = profile.fullName.isEmpty ? '@${profile.username}' : profile.fullName;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Flexible(
              child: Semantics(
                header: true,
                child: Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: typography.body.copyWith(color: colors.text, fontWeight: FontWeight.w700),
                ),
              ),
            ),
            if (profile.verifiedBadge) ...[
              const SizedBox(width: AppSpacing.xs),
              VerifiedBadge(semanticLabel: t.t('profile.verified.label')),
            ],
          ],
        ),
        Text(
          '@${profile.username} · ${t.t('profile.attorneyChip')}',
          style: typography.caption.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.xs),
        // Rating as a quiet line under the name (not a badge on the
        // photo, not a card): "★ 4.5 · 12 reviews", tap → Reviews.
        Semantics(
          button: true,
          label: t.t('profile.tab.reviews'),
          child: AppPressable(
            onTap: onRating,
            child: Row(
              children: [
                Icon(Icons.star_rounded, size: 16, color: colors.gold),
                const SizedBox(width: 3),
                Text(
                  r.isNew ? '—' : r.average!.toStringAsFixed(1),
                  style: typography.bodySmall.copyWith(color: colors.text, fontWeight: FontWeight.w700),
                ),
                Text(' · ', style: typography.bodySmall.copyWith(color: colors.textSecondary)),
                Flexible(
                  child: Text(
                    r.isNew ? t.t('profile.rating.newShort') : t.plural('profile.rating.count', r.count),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: typography.bodySmall.copyWith(color: colors.textSecondary),
                  ),
                ),
                Icon(Icons.chevron_right_rounded, size: 16, color: colors.textSecondary),
              ],
            ),
          ),
        ),
        if (bio != null && bio.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.sm),
          Text(bio, style: typography.bodySmall.copyWith(color: colors.text, height: 1.4)),
        ],
      ],
    );
  }
}

/// A practice chip: one specialization, or a category with several picked
/// specializations ("Family Law · 3", tap = full list) — docs/03 §3.2.
@immutable
class PracticeChipGroup {
  const PracticeChipGroup({required this.label, required this.items});
  final String label;
  final List<String> items;
}

List<PracticeChipGroup> groupPractices(
  Translator t,
  List<SelectedPractice> practices,
  Map<String, PracticeCategory> categories,
) {
  final byCategory = <String, List<SelectedPractice>>{};
  for (final p in practices) {
    (byCategory[p.categoryId] ??= []).add(p);
  }
  return [
    for (final entry in byCategory.entries)
      if (entry.value.length == 1)
        PracticeChipGroup(
          label: localizedName(t, entry.value.first.i18nKey, entry.value.first.nameEn),
          items: const [],
        )
      else
        PracticeChipGroup(
          label: localizedName(
            t,
            entry.value.first.categoryI18nKey,
            categories[entry.key]?.nameEn ?? humanizeCode(entry.value.first.categoryCode),
          ),
          items: [for (final p in entry.value) localizedName(t, p.i18nKey, p.nameEn)],
        ),
  ];
}

class _ChipRows extends ConsumerWidget {
  const _ChipRows({required this.profile});

  final PublicAttorneyProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final tree = ref.watch(practiceTreeProvider).value ?? const [];
    final categories = {for (final c in tree) c.id: c};
    final groups = groupPractices(t, profile.practices, categories);
    final firm = profile.firmName?.trim();

    // One compact line per section (owner redesign): a small gold icon
    // (its label read by screen readers) + chips scrolling sideways.
    Widget row(String label, IconData icon, List<Widget> chips) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Row(
            children: [
              Semantics(
                label: label,
                child: Icon(icon, size: AppSizes.iconSm, color: colors.goldDark),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      for (var i = 0; i < chips.length; i++) ...[
                        if (i > 0) const SizedBox(width: AppSpacing.xs),
                        chips[i],
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
        );

    final languages = [
      for (final code in profile.languages)
        kLanguageCatalog.where((l) => l.code == code).map((l) => l.nativeName).firstOrNull ?? code,
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (firm != null && firm.isNotEmpty)
          row(t.t('profile.section.firm'), Icons.apartment_rounded, [AppChip(label: firm)]),
        if (groups.isNotEmpty)
          row(t.t('profile.section.practices'), Icons.gavel_rounded, [
            for (final g in groups)
              AppChip(
                label: g.items.isEmpty ? g.label : t.t('profile.practices.group', {'name': g.label, 'count': '${g.items.length}'}),
                trailing: g.items.isEmpty ? null : Icon(Icons.expand_more_rounded, size: AppSpacing.lg, color: colors.textSecondary),
                onTap: g.items.isEmpty ? null : () => _showGroup(context, g),
              ),
          ]),
        if (profile.licensedStates.isNotEmpty)
          row(t.t('profile.section.states'), Icons.account_balance_outlined, [
            for (final s in profile.licensedStates) AppChip(label: s.name),
          ]),
        if (languages.isNotEmpty)
          row(t.t('profile.section.languages'), Icons.translate_rounded, [
            for (final l in languages) AppChip(label: l),
          ]),
      ],
    );
  }

  void _showGroup(BuildContext context, PracticeChipGroup group) {
    showAppBottomSheet<void>(
      context: context,
      builder: (sheetContext) {
        final colors = Theme.of(sheetContext).extension<AppColorTokens>()!;
        final typography = Theme.of(sheetContext).extension<AppTypographyTokens>()!;
        return SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide, AppSpacing.md, AppSpacing.screenSide, AppSpacing.lg),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const AppSheetHandle(),
                Semantics(
                  header: true,
                  child: Text(group.label, style: typography.titleMedium.copyWith(color: colors.text)),
                ),
                const SizedBox(height: AppSpacing.md),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [for (final i in group.items) AppChip(label: i)],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Small caption with a leading icon, used above chip rows.
class StepLabel extends StatelessWidget {
  const StepLabel({required this.icon, required this.label, super.key});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Row(
      children: [
        Icon(icon, size: AppSpacing.lg, color: colors.goldStroke),
        const SizedBox(width: AppSpacing.xs),
        Flexible(
          child: Text(
            label,
            style: typography.bodySmall.copyWith(color: colors.textSecondary, fontWeight: FontWeight.w600),
          ),
        ),
      ],
    );
  }
}

class _Actions extends ConsumerWidget {
  const _Actions({
    required this.isSelf,
    required this.attorneyId,
    required this.isFollowing,
    required this.onMessage,
    required this.onShare,
  });

  final bool isSelf;
  final String attorneyId;
  final bool isFollowing;
  final VoidCallback onMessage;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Row(
      children: [
        Expanded(
          child: isSelf
              ? _QuietButton(
                  label: t.t('profile.action.edit'),
                  onTap: () => context.push(AppRoutes.profileEdit),
                )
              : FollowButton(attorneyId: attorneyId, initial: isFollowing, expanded: true),
        ),
        if (!isSelf) ...[
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: _QuietButton(
              label: t.t('profile.action.message'),
              onTap: onMessage,
            ),
          ),
        ],
        const SizedBox(width: AppSpacing.sm),
        // Share as a small icon square (Instagram-style), full tap target.
        Semantics(
          button: true,
          label: t.t('profile.action.share'),
          excludeSemantics: true,
          child: AppPressable(
            onTap: onShare,
            child: Container(
              width: AppSizes.touchTarget,
              height: _QuietButton.height,
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.field),
                border: Border.all(color: colors.border),
              ),
              child: Icon(Icons.ios_share_rounded, size: AppSizes.iconSm, color: colors.text),
            ),
          ),
        ),
      ],
    );
  }
}

/// Instagram-style secondary button: soft fill, no icon, small type.
class _QuietButton extends StatelessWidget {
  const _QuietButton({required this.label, required this.onTap, this.loading = false});

  static const double height = AppSizes.touchTarget;

  final String label;
  final VoidCallback onTap;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          height: height,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.field),
            border: Border.all(color: colors.border),
          ),
          child: loading
              ? SizedBox.square(
                  dimension: AppSizes.iconSm,
                  child: CircularProgressIndicator(strokeWidth: 2, color: colors.text),
                )
              : Padding(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
                  child: FittedBox(
                    fit: BoxFit.scaleDown,
                    child: Text(label, maxLines: 1, style: typography.button.copyWith(fontSize: 14, color: colors.text)),
                  ),
                ),
        ),
      ),
    );
  }
}

class _Tabs extends ConsumerWidget {
  const _Tabs({required this.selected, required this.onChanged});

  final AttorneyProfileTab selected;
  final ValueChanged<AttorneyProfileTab> onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final t = ref.watch(translatorProvider);
    final reduce = context.reduceMotion;
    final tabs = [
      (AttorneyProfileTab.posts, t.t('profile.tab.posts'), Icons.grid_on_rounded),
      (AttorneyProfileTab.reviews, t.t('profile.tab.reviews'), Icons.star_border_rounded),
    ];
    return DecoratedBox(
      decoration: BoxDecoration(border: Border(bottom: BorderSide(color: colors.border))),
      child: Stack(
        children: [
          Row(
            children: [
              for (final (tab, label, icon) in tabs)
                Expanded(
                  child: Semantics(
                    button: true,
                    selected: tab == selected,
                    label: label,
                    excludeSemantics: true,
                    onTap: () => onChanged(tab),
                    child: GestureDetector(
                      key: ValueKey('profile-tab-${tab.name}'),
                      behavior: HitTestBehavior.opaque,
                      onTap: () => onChanged(tab),
                      child: SizedBox(
                        height: AppSizes.touchTarget,
                        child: Icon(
                          icon,
                          size: AppSizes.iconMd,
                          color: tab == selected ? colors.text : colors.textSecondary,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
          Positioned.fill(
            child: AnimatedAlign(
              alignment: selected == AttorneyProfileTab.posts ? Alignment.bottomLeft : Alignment.bottomRight,
              duration: reduce ? Duration.zero : AppMotion.stateChange,
              curve: AppMotion.enterCurve,
              child: FractionallySizedBox(
                widthFactor: 0.5,
                child: Container(height: 2, color: colors.gold),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TabMessage extends StatelessWidget {
  const _TabMessage({
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return AppEntrance(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xl, horizontal: AppSpacing.lg),
        child: Column(
          children: [
            AppIconMedallion(icon: icon, size: AppSizes.stateMedallion - AppSpacing.xl, iconSize: AppSizes.iconLg),
            const SizedBox(height: AppSpacing.md),
            Text(title, textAlign: TextAlign.center, style: typography.roleTitle.copyWith(color: colors.text)),
            const SizedBox(height: AppSpacing.xs),
            Text(message, textAlign: TextAlign.center, style: typography.body.copyWith(color: colors.textSecondary)),
            if (actionLabel != null) ...[
              const SizedBox(height: AppSpacing.lg),
              SizedBox(
                width: AppSizes.stateActionWidth,
                child: AppButton(
                  label: actionLabel!,
                  icon: Icons.refresh_rounded,
                  variant: AppButtonVariant.secondary,
                  height: AppSizes.touchTarget,
                  onPressed: onAction,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Loading skeleton in the shape of the profile (header, rating card,
/// chips, tabs).
class AttorneyProfileSkeleton extends StatelessWidget {
  const AttorneyProfileSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide, AppSpacing.sm, AppSpacing.screenSide, AppSpacing.xxl),
      children: const [
        AppSkeleton(height: 200, borderRadius: AppRadii.card),
        SizedBox(height: AppSpacing.md),
        AppSkeleton(height: 104, borderRadius: AppRadii.card),
        SizedBox(height: AppSpacing.lg),
        FractionallySizedBox(widthFactor: 0.3, alignment: Alignment.centerLeft, child: AppSkeleton(height: AppSpacing.xl, borderRadius: AppRadii.pill)),
        SizedBox(height: AppSpacing.md),
        AppSkeleton(height: AppSpacing.md),
        SizedBox(height: AppSpacing.sm),
        FractionallySizedBox(widthFactor: 0.8, alignment: Alignment.centerLeft, child: AppSkeleton(height: AppSpacing.md)),
        SizedBox(height: AppSpacing.lg),
        Row(
          children: [
            AppSkeleton(width: 96, height: 36, borderRadius: AppRadii.pill),
            SizedBox(width: AppSpacing.sm),
            AppSkeleton(width: 120, height: 36, borderRadius: AppRadii.pill),
          ],
        ),
        SizedBox(height: AppSpacing.xl),
        AppSkeleton(height: AppSizes.touchTarget + AppSpacing.sm, borderRadius: AppRadii.button),
      ],
    );
  }
}

/// Message shown when a profile can't be opened: unknown, suspended
/// (docs/03 §4.2 «Профиль недоступен») or a client (§5: 404).
class ProfileUnavailableState extends ConsumerWidget {
  const ProfileUnavailableState({super.key, this.onBack});

  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return AppEmptyState(
      icon: Icons.person_off_outlined,
      title: t.t('profile.unavailable.title'),
      message: t.t('profile.unavailable.body'),
      action: onBack == null
          ? null
          : AppButton(
              label: t.t('common.back'),
              variant: AppButtonVariant.secondary,
              height: AppSizes.touchTarget,
              onPressed: onBack,
            ),
    );
  }
}
