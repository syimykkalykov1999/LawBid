import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_cases_tab.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/features/chat/presentation/chats_icon_button.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/feed/presentation/widgets/topic_filter_bar.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

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

enum _FeedTab { posts, cases }

class _FeedScreenState extends ConsumerState<FeedScreen> {
  // docs/05 §2.1: attorneys get "Лента" (posts) and "Кейсы"; switching
  // keeps each tab's scroll position (IndexedStack keeps both alive).
  _FeedTab _tab = _FeedTab.posts;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final attorney = ref.watch(actsAsAttorneyProvider);

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
            trailing: const [ChatsIconButton()],
          );

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: header,
      body: attorney
          ? IndexedStack(
              index: _tab.index,
              children: [
                // Owner 2026-09-30: the topic slider for every role.
                const _TopicFeed(),
                const AttorneyCasesTab(),
              ],
            )
          : const _TopicFeed(),
    );
  }
}

/// The topic slider above the post stream ("All" = the regular feed; a
/// state narrows to attorneys licensed there — OQ-034).
class _TopicFeed extends StatefulWidget {
  const _TopicFeed();

  @override
  State<_TopicFeed> createState() => _TopicFeedState();
}

class _TopicFeedState extends State<_TopicFeed> {
  String? _category;
  String? _state;

  @override
  Widget build(BuildContext context) {
    final category = _category;
    final state = _state;
    return Column(
      children: [
        TopicFilterBar(
          category: category,
          onCategory: (v) => setState(() => _category = v),
          stateCode: state,
          onState: (v) => setState(() => _state = v),
        ),
        Expanded(
          // Owner 2026-09-30: News, or one qualification (with its
          // subcategories), optionally in a state.
          child: category != null
              ? FilteredPostsView(
                  key: ValueKey('$category|$state'),
                  practice: category == kNewsTopic ? null : category,
                  newsOnly: category == kNewsTopic,
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
