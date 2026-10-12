import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_cases_tab.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/chat/presentation/chats_icon_button.dart';
import 'package:lawbid/features/feed/application/feed_content.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/feed/application/news_flag.dart';
import 'package:lawbid/features/feed/presentation/widgets/feed_chrome.dart';
import 'package:lawbid/features/feed/presentation/widgets/topic_filter_bar.dart';
import 'package:lawbid/features/reels/presentation/reels_screen.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show feedCardHeight, topicCategory;
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

/// Feed tab (docs/01 §3.1, docs/05 §2). Header per docs/07 §10: the small
/// static ScalesLogo on the left; the right side ([AppFeedHeader.trailing])
/// is the Chats icon with its unread badge (docs/05 §10).
///
/// Clients: one post stream. Attorneys: "Лента" (posts) and "Кейсы"
/// (docs/04 §4.2) tabs.
class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

enum _FeedTab { posts, reels, cases }

class _FeedScreenState extends ConsumerState<FeedScreen> {
  // docs/05 §2.1: attorneys get "Лента" (posts) and "Кейсы"; switching
  // keeps each tab's scroll position (IndexedStack keeps both alive).
  _FeedTab _tab = _FeedTab.posts;
  final _chrome = FeedChromeController();

  @override
  void dispose() {
    _chrome.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    // Audit 2026-10-02: an assistant sees the Cases tab only with "cases".
    final attorney = ref.watch(actsAsAttorneyProvider) &&
        ref.watch(canDoProvider(AssistantDuty.cases));

    // Owner 2026-09-30 header: clients — scales left, "LawBid" centred,
    // chats right; attorneys — "LawBid" left, Posts | Cases centred,
    // chats right.
    final header = attorney
        ? AppFeedHeader(
            logoSemanticLabel: t.t('brand.name'),
            // Owner 2026-09-30: the animated scales from the welcome
            // screen, header-sized, instead of the text wordmark.
            leading: ExcludeSemantics(
              child: ScalesLogo(
                size: 44,
                animated: true,
                runFor: const Duration(seconds: 6),
                semanticLabel: t.t('brand.name'),
              ),
            ),
            center: PillTabs<_FeedTab>(
              value: _tab,
              padding: EdgeInsets.zero,
              tabs: [
                (_FeedTab.posts, t.t('feed.tab.posts')),
                (_FeedTab.reels, t.t('reels.title')),
                (_FeedTab.cases, t.t('feed.tab.cases')),
              ],
              onChanged: (v) => setState(() => _tab = v),
            ),
            trailing: const [ChatsIconButton()],
          )
        : AppFeedHeader(
            logoSemanticLabel: t.t('brand.name'),
            // Decorative: the header itself is announced as "LawBid".
            leading: ExcludeSemantics(
              child: ScalesLogo(
                size: 40,
                animated: true,
                runFor: const Duration(seconds: 6),
                semanticLabel: t.t('brand.name'),
              ),
            ),
            center: PillTabs<_FeedTab>(
              value: _tab,
              padding: EdgeInsets.zero,
              tabs: [
                (_FeedTab.posts, t.t('feed.tab.posts')),
                (_FeedTab.reels, t.t('reels.title')),
              ],
              onChanged: (v) => setState(() {
                _tab = v;
                _chrome.show();
              }),
            ),
            trailing: const [ChatsIconButton()],
          );

    // Owner 2026-10-12: the Reels tab is the player over the whole screen;
    // the tabs and the filters lie over the video, the app header is gone.
    if (_tab == _FeedTab.reels) {
      return _ReelsTab(
        tabs: [
          (_FeedTab.posts, t.t('feed.tab.posts')),
          (_FeedTab.reels, t.t('reels.title')),
          if (attorney) (_FeedTab.cases, t.t('feed.tab.cases')),
        ],
        onTab: (v) => setState(() {
          _tab = v;
          _chrome.show();
        }),
      );
    }
    final topInset = MediaQuery.paddingOf(context).top;
    final bottomInset = MediaQuery.paddingOf(context).bottom;
    // Owner 2026-10-12: Posts | Reels | Cases for attorneys and their
    // assistants; Posts | Reels for clients.
    final content = attorney
        ? TabSwipe<_FeedTab>(
            value: _tab,
            values: _FeedTab.values,
            onChanged: (v) => setState(() {
              _tab = v;
              _chrome.show();
            }),
            child: IndexedStack(
              index: _tab.index,
              children: const [
                // Owner 2026-09-30: the topic slider for every role.
                _TopicFeed(),
                // Built only while open, so hidden reels never play.
                // The Reels tab is its own full-screen layout (see build).
                SizedBox.shrink(),
                AttorneyCasesTab(),
              ],
            ),
          )
        : IndexedStack(
            index: _tab == _FeedTab.reels ? 1 : 0,
            children: const [_TopicFeed(), SizedBox.shrink()],
          );
    return Scaffold(
      backgroundColor: colors.bg,
      body: FeedChrome(
        controller: _chrome,
        child: LayoutBuilder(
          builder: (context, box) {
            // Cards are sized for the hidden header (the rows leave on the
            // first scroll); the floating nav bar is a bottom inset.
            _chrome.cardHeight =
                feedCardHeight(box.maxHeight - topInset - bottomInset);
            return NotificationListener<ScrollNotification>(
              onNotification: (n) =>
                  _tab != _FeedTab.reels && _chrome.onScroll(n),
              child: Column(
                children: [
                  ColoredBox(
                    color: colors.bg,
                    child: SizedBox(height: topInset, width: double.infinity),
                  ),
                  ChromeCollapse(
                    child: MediaQuery.removePadding(
                      context: context,
                      removeTop: true,
                      child: header,
                    ),
                  ),
                  Expanded(child: content),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

/// The topic slider above the post stream ("All" = the regular feed; a
/// state narrows to attorneys licensed there — OQ-034).
class _TopicFeed extends ConsumerStatefulWidget {
  const _TopicFeed();

  @override
  ConsumerState<_TopicFeed> createState() => _TopicFeedState();
}

class _TopicFeedState extends ConsumerState<_TopicFeed> {
  String? _category;
  // Owner 2026-10-06: several states at once (none = every state).
  Set<String> _states = {};

  @override
  void initState() {
    super.initState();
    // Owner 2026-10-05: the "Content" setting as the server has it.
    Future.microtask(() {
      if (mounted) ref.read(feedContentModeProvider.notifier).sync();
    });
  }

  @override
  Widget build(BuildContext context) {
    final legalOnly =
        ref.watch(feedContentModeProvider) == FeedContentMode.legalOnly;
    // "Legal only" hides general posts, so their topic falls back to All.
    // Owner 2026-10-06: News off → its topic falls back to All too.
    final newsOff = !ref.watch(newsEnabledProvider);
    final category = (legalOnly && _category == kGeneralPostsTopic) ||
            (newsOff && _category == kNewsTopic)
        ? null
        : _category;
    final codes = _states.toList()..sort();
    final state = codes.isEmpty ? null : codes.join(',');
    // Owner 2026-10-06: «Юр. посты» → «Только мои темы» = legal posts of
    // the qualifications picked in «Выберите темы».
    final mine = legalOnly &&
        category == null &&
        ref.watch(feedLegalScopeProvider) == FeedLegalScope.mine;
    final myTopics = [
      for (final c in ref.watch(feedTopicsProvider))
        if (c != kNewsTopic && c != kGeneralPostsTopic) c,
    ];
    return Column(
      children: [
        TopicFilterBar(
          category: category,
          onCategory: (v) => setState(() => _category = v),
          stateCodes: _states,
          onStates: (v) => setState(() => _states = v),
        ),
        Expanded(
          // Owner 2026-09-30: News, or one qualification (with its
          // subcategories), optionally in states.
          child: category != null
              ? FilteredPostsView(
                  key: ValueKey('$category|$state'),
                  practice:
                      category == kNewsTopic || category == kGeneralPostsTopic
                          ? null
                          : category,
                  newsOnly: category == kNewsTopic,
                  generalOnly: category == kGeneralPostsTopic,
                  stateCode: state,
                )
              : mine
                  ? myTopics.isEmpty
                      ? AppEmptyState(
                          key: const ValueKey('feed-legal-mine-empty'),
                          icon: AppIcons.gavelRounded,
                          message: ref
                              .watch(translatorProvider)
                              .t('feed.legal.mineEmpty'),
                        )
                      : FilteredPostsView(
                          key: ValueKey('mine|${myTopics.join(',')}|$state'),
                          practices: myTopics,
                          stateCode: state,
                        )
                  : state != null
                      ? LatestPostsView(key: ValueKey(state), stateCode: state)
                      : const PostsFeedView(),
        ),
      ],
    );
  }
}

/// Two content-card silhouettes, the back one smaller and fading into
/// the background — a calm "deck" hinting at posts to come. Static
/// (no shimmer): it is an illustration, not a loading indicator.
class FeedPreviewIllustration extends StatelessWidget {
  const FeedPreviewIllustration({super.key});

  static const double _width = 280;
  static const double _backScale = 0.9;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return SizedBox(
      width: _width,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.topCenter,
        children: [
          Transform.scale(
            scale: _backScale,
            alignment: Alignment.topCenter,
            child: const Opacity(
              opacity: 0.5,
              child: AppContentCardSkeleton(shimmer: false),
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xl),
            child: ShaderMask(
              blendMode: BlendMode.dstIn,
              shaderCallback: (rect) => LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [colors.bg, colors.bg.withValues(alpha: 0)],
                stops: const [0.55, 1],
              ).createShader(rect),
              child: const AppContentCardSkeleton(shimmer: false),
            ),
          ),
        ],
      ),
    );
  }
}

/// The Reels tab (owner 2026-10-12): the vertical player over the whole
/// screen, the tabs (Posts | Reels | Cases) and the topic filters lie over
/// the video in white, no bar or fill; the nav bar floats over it.
class _ReelsTab extends ConsumerStatefulWidget {
  const _ReelsTab({required this.tabs, required this.onTab});

  final List<(_FeedTab, String)> tabs;
  final ValueChanged<_FeedTab> onTab;

  @override
  ConsumerState<_ReelsTab> createState() => _ReelsTabState();
}

class _ReelsTabState extends ConsumerState<_ReelsTab> {
  String? _category;

  bool _accepts(Post p, {required bool legalOnly}) {
    if (legalOnly && p.isGeneral) return false;
    final c = _category;
    if (c == null) return true;
    if (p.practice?.categoryCode == c) return true;
    return p.tags.map(topicCategory).contains(c);
  }

  @override
  Widget build(BuildContext context) {
    final legalOnly =
        ref.watch(feedContentModeProvider) == FeedContentMode.legalOnly;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final media = MediaQuery.of(context);
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Stack(
          children: [
            Positioned.fill(
              // The floating nav bar is a bottom inset for the reel's
              // buttons; the video itself runs under it.
              child: MediaQuery(
                data: media.copyWith(
                  padding: media.padding.copyWith(
                    bottom: media.padding.bottom + 62,
                  ),
                ),
                child: ReelsScreen(
                  // A new filter starts the player over.
                  key: ValueKey('reels|$_category|$legalOnly'),
                  embedded: true,
                  filter: (p) => _accepts(p, legalOnly: legalOnly),
                ),
              ),
            ),
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.5),
                      Colors.black.withValues(alpha: 0),
                    ],
                  ),
                ),
                child: SafeArea(
                  bottom: false,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        height: 44,
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            for (final (tab, label) in widget.tabs)
                              Semantics(
                                button: true,
                                selected: tab == _FeedTab.reels,
                                label: label,
                                excludeSemantics: true,
                                child: GestureDetector(
                                  behavior: HitTestBehavior.opaque,
                                  onTap: () => widget.onTab(tab),
                                  child: Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: AppSpacing.md,
                                      vertical: AppSpacing.sm,
                                    ),
                                    child: Text(
                                      label,
                                      style: type.titleMedium.copyWith(
                                        fontSize: 18,
                                        color: tab == _FeedTab.reels
                                            ? Colors.white
                                            : Colors.white
                                                .withValues(alpha: 0.7),
                                        fontWeight: tab == _FeedTab.reels
                                            ? FontWeight.w700
                                            : FontWeight.w500,
                                        shadows: const [
                                          Shadow(
                                            blurRadius: 8,
                                            color: Colors.black54,
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                      TopicFilterBar(
                        category: _category,
                        onCategory: (v) => setState(() => _category = v),
                        showNews: false,
                        onDark: true,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
