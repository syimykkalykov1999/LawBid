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

enum AttorneyProfileTab { posts, reviews }

/// Public link of an attorney profile (docs/03 §4.2 «Поделиться», deep
/// link of docs/01 §12).
String attorneyShareLink(String host, String username) => 'https://$host/lawyer/$username';

/// docs/03 §4.2 attorney profile, top to bottom: header (photo, @username
/// + blue check, counters) → gold rating card → "Attorney" chip + bio →
/// chip rows (firm, practices, licensed states) → buttons → Posts /
/// Reviews tabs. The same view serves the caller's own profile ([profile]
/// `.isSelf`: Edit + Share) and anyone else's (Follow + Share; no "Message"
/// — chats open from a case only). Pull-to-refresh reloads everything.
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

  PublicAttorneyProfile get p => widget.profile;

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
    final reviews = reviewsTab ? ref.watch(reviewsListProvider(p.id)) : null;
    final summary = reviewsTab ? ref.watch(reviewSummaryProvider(p.id)) : null;
    final state = reviews?.value;

    final header = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: staggeredEntrance([
        if (widget.needsVerification) ...[
          _VerificationBanner(t: t),
          const SizedBox(height: AppSpacing.md),
        ],
        _HeaderCard(profile: p),
        const SizedBox(height: AppSpacing.md),
        RatingCard(
          name: p.fullName.isEmpty ? '@${p.username}' : p.fullName,
          rating: p.rating,
          onTap: () => setState(() => _tab = AttorneyProfileTab.reviews),
        ),
        const SizedBox(height: AppSpacing.lg),
        _AboutSection(profile: p),
        const SizedBox(height: AppSpacing.md),
        _ChipRows(profile: p),
        const SizedBox(height: AppSpacing.lg),
        _Actions(
          isSelf: p.isSelf,
          attorneyId: p.id,
          isFollowing: p.isFollowing,
          onShare: () => _share(t),
        ),
        const SizedBox(height: AppSpacing.xl),
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
                    child: ReviewSummaryPanel(summary: s),
                  ),
          ),
      ]),
    );

    // Footer: posts placeholder (file 05), the reviews tab's own
    // loading/error/empty ("New — no reviews") states.
    Widget? footer;
    var status = AppPaginationStatus.idle;
    List<Review> items = const [];
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
        onAction: () => ref.invalidate(reviewsListProvider(p.id)),
      );
    } else if (state != null && state.items.isEmpty) {
      footer = _TabMessage(
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
        if (reviewsTab) ref.read(reviewsListProvider(p.id).notifier).loadMore();
      },
      onRetry: () {
        if (reviewsTab) ref.read(reviewsListProvider(p.id).notifier).loadMore();
      },
      onRefresh: () async {
        ref
          ..invalidate(reviewSummaryProvider(p.id))
          ..invalidate(reviewsListProvider(p.id));
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
            const AppIconMedallion(icon: Icons.verified_user_outlined, size: AppSizes.rowMedallion, iconSize: AppSizes.iconSm),
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

  static const _band = AppSizes.stateMedallion - AppSpacing.md;
  static const _avatar = AppSizes.stateMedallion;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);

    return AppCard(
      elevated: true,
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            height: _band + _avatar / 2,
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned(
                  left: 0,
                  right: 0,
                  top: 0,
                  height: _band,
                  child: ClipRRect(
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadii.card)),
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [colors.navy, Color.lerp(colors.navy, colors.goldLight, 0.12)!],
                        ),
                        border: Border(bottom: BorderSide(color: colors.gold, width: 1.5)),
                      ),
                      // Faint scales watermark (brand motif), decorative.
                      child: Align(
                        alignment: const Alignment(0.92, 0),
                        child: ExcludeSemantics(
                          child: Icon(
                            Icons.balance_rounded,
                            size: _band - AppSpacing.md,
                            color: colors.gold.withValues(alpha: 0.18),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: AppSpacing.lg,
                  top: _band - _avatar / 2,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: colors.surface, width: AppSpacing.xs),
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
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(AppSpacing.lg, AppSpacing.md, AppSpacing.lg, AppSpacing.lg),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Semantics(
                        header: true,
                        child: Text(
                          '@${profile.username}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: typography.titleMedium.copyWith(color: colors.text),
                        ),
                      ),
                    ),
                    if (profile.verifiedBadge) ...[
                      const SizedBox(width: AppSpacing.sm),
                      VerifiedBadge(semanticLabel: t.t('profile.verified.label'), size: AppSizes.iconMd),
                    ],
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                Row(
                  children: [
                    _Counter(value: formats.number(profile.counters.posts), label: t.t('profile.counters.posts')),
                    _Divider(color: colors.border),
                    _Counter(
                      value: formats.number(profile.counters.followers),
                      label: t.t('profile.counters.followers'),
                      onTap: () => context.push(SocialRoutes.followers(profile.id)),
                    ),
                    _Divider(color: colors.border),
                    _Counter(
                      value: formats.number(profile.counters.following),
                      label: t.t('profile.counters.following'),
                      onTap: () => context.push(SocialRoutes.following(profile.id)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Counter extends StatelessWidget {
  const _Counter({required this.value, required this.label, this.onTap});

  final String value;
  final String label;

  /// Followers / following open their lists (docs/05 §6.2).
  final VoidCallback? onTap;

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
          child: Column(
          children: [
            Text(value, style: typography.roleTitle.copyWith(color: colors.text)),
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
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: AppSpacing.xl + AppSpacing.sm, color: color);
}

class _AboutSection extends ConsumerWidget {
  const _AboutSection({required this.profile});

  final PublicAttorneyProfile profile;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final bio = profile.bio?.trim();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.xs),
          decoration: BoxDecoration(
            color: colors.navy,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(color: colors.gold),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.balance_rounded, size: AppSpacing.lg, color: colors.goldLight),
              const SizedBox(width: AppSpacing.xs),
              Text(t.t('profile.attorneyChip'), style: typography.badge.copyWith(color: colors.goldLight)),
            ],
          ),
        ),
        if (bio != null && bio.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          Text(bio, style: typography.body.copyWith(color: colors.text)),
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

    Widget row(String label, IconData icon, List<Widget> chips) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              child: StepLabel(icon: icon, label: label),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              clipBehavior: Clip.none,
              child: Row(
                children: [
                  for (var i = 0; i < chips.length; i++) ...[
                    if (i > 0) const SizedBox(width: AppSpacing.sm),
                    chips[i],
                  ],
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
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
    required this.onShare,
  });

  final bool isSelf;
  final String attorneyId;
  final bool isFollowing;
  final VoidCallback onShare;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return Row(
      children: [
        Expanded(
          child: isSelf
              ? AppButton(
                  label: t.t('profile.action.edit'),
                  icon: Icons.edit_outlined,
                  height: AppSizes.touchTarget,
                  onPressed: () => context.push(AppRoutes.profileEdit),
                )
              : FollowButton(
                  attorneyId: attorneyId,
                  initial: isFollowing,
                  expanded: true,
                ),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: AppButton(
            label: t.t('profile.action.share'),
            icon: Icons.ios_share_rounded,
            variant: AppButtonVariant.secondary,
            height: AppSizes.touchTarget,
            onPressed: onShare,
          ),
        ),
      ],
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
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final reduce = context.reduceMotion;
    final tabs = [
      (AttorneyProfileTab.posts, t.t('profile.tab.posts'), Icons.grid_view_rounded),
      (AttorneyProfileTab.reviews, t.t('profile.tab.reviews'), Icons.star_outline_rounded),
    ];
    return Container(
      padding: const EdgeInsets.all(AppSpacing.xs),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.button),
        border: Border.all(color: colors.border),
      ),
      child: Stack(
        children: [
          Positioned.fill(
            child: AnimatedAlign(
              alignment: selected == AttorneyProfileTab.posts ? Alignment.centerLeft : Alignment.centerRight,
              duration: reduce ? Duration.zero : AppMotion.stateChange,
              curve: AppMotion.enterCurve,
              child: FractionallySizedBox(
                widthFactor: 0.5,
                heightFactor: 1,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: colors.accent,
                    borderRadius: BorderRadius.circular(AppRadii.field),
                  ),
                ),
              ),
            ),
          ),
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
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(icon, size: AppSizes.iconSm, color: tab == selected ? colors.onAccent : colors.textSecondary),
                            const SizedBox(width: AppSpacing.xs),
                            Flexible(
                              child: AnimatedDefaultTextStyle(
                                duration: reduce ? Duration.zero : AppMotion.stateChange,
                                style: typography.button.copyWith(
                                  color: tab == selected ? colors.onAccent : colors.textSecondary,
                                ),
                                child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
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
