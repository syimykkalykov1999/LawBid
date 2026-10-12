import 'dart:ui' show ImageFilter;

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

    // Owner 2026-10-12: one header for every tab — the logo on the left,
    // Posts | Reels (| Cases) in the middle, chats on the right — with the
    // same size and place in Posts, Cases and Reels. In Reels it only lies
    // over the video (white, no fill).
    Widget buildHeader({required bool onDark, bool bare = false}) =>
        AppFeedHeader(
          logoSemanticLabel: t.t('brand.name'),
          onDark: onDark,
          bare: bare,
          // Decorative: the header itself is announced as "LawBid".
          leading: ExcludeSemantics(
            // Owner 2026-10-12: always a round disc (top of the feed and
            // scrolled alike), so nothing morphs while scrolling.
            child: _FloatDisc(
              forceDark: onDark,
              icon: ({required dark}) => ColorFiltered(
                colorFilter: ColorFilter.mode(
                  dark ? Colors.white : colors.navy,
                  BlendMode.srcIn,
                ),
                child: ScalesLogo(
                  size: 26,
                  semanticLabel: t.t('brand.name'),
                ),
              ),
            ),
          ),
          // The tabs leave with the filters on a scroll down; the logo and
          // the chats stay.
          center: ChromeFade(
            child: PillTabs<_FeedTab>(
              value: _tab,
              padding: EdgeInsets.zero,
              onDark: onDark,
              tabs: [
                (_FeedTab.posts, t.t('feed.tab.posts')),
                (_FeedTab.reels, t.t('reels.title')),
                if (attorney) (_FeedTab.cases, t.t('feed.tab.cases')),
              ],
              onChanged: (v) => setState(() {
                _tab = v;
                _chrome.show();
              }),
            ),
          ),
          trailing: [
            _FloatDisc(
              forceDark: onDark,
              icon: ({required dark}) => ChatsIconButton(onDark: dark),
            ),
          ],
        );

    // Owner 2026-10-12: the Reels tab is the player over the whole screen;
    // the same header and the filters lie over the video.
    if (_tab == _FeedTab.reels) {
      return FeedChrome(
        controller: _chrome,
        child: _ReelsTab(header: buildHeader(onDark: true)),
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
            // Cards are sized for the scrolled state: the slim header only
            // floats over them; the floating nav bar is a bottom inset.
            _chrome.cardHeight = feedCardHeight(
              box.maxHeight - topInset - bottomInset,
            );
            return NotificationListener<ScrollNotification>(
              onNotification: (n) =>
                  _tab != _FeedTab.reels && _chrome.onScroll(n),
              child: AnimatedBuilder(
                animation: _chrome,
                builder: (context, _) {
                  final shown = _chrome.visible;
                  final reduce = MediaQuery.disableAnimationsOf(context);
                  final duration = reduce
                      ? Duration.zero
                      : const Duration(milliseconds: 200);
                  return Stack(
                    children: [
                      // Owner 2026-10-12: scrolled, the header is only the
                      // logo and the chats over the feed (no white bar), so
                      // the content gives its place back.
                      Positioned.fill(
                        child: AnimatedPadding(
                          duration: duration,
                          curve: Curves.easeOutCubic,
                          padding: EdgeInsets.only(
                            top: topInset + (shown ? AppSizes.feedHeader : 0),
                          ),
                          child: content,
                        ),
                      ),
                      Positioned(
                        top: 0,
                        left: 0,
                        right: 0,
                        child: Column(
                          children: [
                            AnimatedContainer(
                              duration: duration,
                              color: shown ? colors.bg : Colors.transparent,
                              height: topInset,
                              width: double.infinity,
                            ),
                            MediaQuery.removePadding(
                              context: context,
                              removeTop: true,
                              child: buildHeader(onDark: false, bare: !shown),
                            ),
                          ],
                        ),
                      ),
                    ],
                  );
                },
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
/// screen; the app header (same as in Posts) and the topic filters lie over
/// the video in white, no bar or fill; the nav bar floats over it.
class _ReelsTab extends ConsumerStatefulWidget {
  const _ReelsTab({required this.header});

  final Widget header;

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
    final media = MediaQuery.of(context);
    return SystemNavBandColor(
      color: Colors.black,
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: SystemUiOverlayStyle.light,
        child: Scaffold(
          backgroundColor: Colors.black,
          body: Stack(
            children: [
              Positioned.fill(
                // The shell (extendBody) already reports the floating nav bar
                // as the bottom padding, so the reel's buttons clear it
                // while the video runs under it.
                child: ReelsScreen(
                  // A new filter starts the player over.
                  key: ValueKey('reels|$_category|$legalOnly'),
                  embedded: true,
                  filter: (p) => _accepts(p, legalOnly: legalOnly),
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
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      // Same status-bar band and header as the other tabs.
                      SizedBox(height: media.padding.top),
                      MediaQuery.removePadding(
                        context: context,
                        removeTop: true,
                        child: widget.header,
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
            ],
          ),
        ),
      ),
    );
  }
}

/// Owner 2026-10-12: the round disc under the logo and the chats icon of
/// the scrolled header. Its look follows the APP THEME only (never the
/// content under it): light theme — light frosted disc, dark icon; dark theme
/// — dark frosted disc, white icon.
class _FloatDisc extends StatelessWidget {
  const _FloatDisc({required this.icon, this.forceDark = false});

  /// Over the Reels video the disc is dark whatever the theme.
  final bool forceDark;

  final Widget Function({required bool dark}) icon;

  @override
  Widget build(BuildContext context) {
    final dark = forceDark || Theme.of(context).brightness == Brightness.dark;
    return Stack(
      alignment: Alignment.center,
      clipBehavior: Clip.none,
      children: [
        ClipOval(
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 14, sigmaY: 14),
            child: Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: dark
                    ? Colors.black.withValues(alpha: 0.5)
                    : const Color(0xFFEDEFF3).withValues(alpha: 0.85),
                border: Border.all(
                  color: dark
                      ? Colors.white.withValues(alpha: 0.18)
                      : Colors.black.withValues(alpha: 0.08),
                ),
              ),
            ),
          ),
        ),
        icon(dark: dark),
      ],
    );
  }
}
