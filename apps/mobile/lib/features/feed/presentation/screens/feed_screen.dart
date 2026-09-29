import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_cases_tab.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Feed tab (docs/01 §3.1). Header per docs/07 §10: the small static
/// ScalesLogo (≈96 wide, no animation, no swing) on the left; the right
/// side is [AppFeedHeader.trailing], reserved for the Chats icon with its
/// unread badge — built in file 05 together with chats/notifications, so
/// it is intentionally empty here (no dead placeholder button).
///
/// The feed content itself (posts for clients; Posts/Cases tabs for
/// attorneys) is file 05. Until then the screen shows its empty state: a
/// still preview of the content cards that will fill it (the reusable
/// `AppContentCard` silhouette), title and message. Loading/error/
/// offline/pagination come with the feed's data source in file 05 via
/// `AppContentCardSkeleton`, `AppErrorState` and `AppPaginatedListView`;
/// the global offline banner already covers this tab.
class FeedScreen extends ConsumerStatefulWidget {
  const FeedScreen({super.key});

  @override
  ConsumerState<FeedScreen> createState() => _FeedScreenState();
}

enum _FeedTab { posts, cases }

class _FeedScreenState extends ConsumerState<FeedScreen> {
  // docs/04 §4.2: attorneys get "Посты" and "Кейсы"; the cases tab opens
  // first until the post feed (docs/05) has content.
  _FeedTab _tab = _FeedTab.cases;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney;
    final posts = AppEmptyState(
      key: const ValueKey('posts'),
      illustration: const FeedPreviewIllustration(),
      title: t.t('feed.empty.title'),
      message: t.t('feed.empty.message'),
    );
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppFeedHeader(logoSemanticLabel: t.t('brand.name')),
      body: !attorney
          ? posts
          : Column(
              children: [
                PillTabs<_FeedTab>(
                  value: _tab,
                  tabs: [
                    (_FeedTab.posts, t.t('feed.tab.posts')),
                    (_FeedTab.cases, t.t('feed.tab.cases')),
                  ],
                  onChanged: (v) => setState(() => _tab = v),
                ),
                Expanded(
                  child: AnimatedSwitcher(
                    duration: context.reduceMotion
                        ? Duration.zero
                        : AppMotion.stateChange,
                    child: _tab == _FeedTab.cases
                        ? const AttorneyCasesTab(key: ValueKey('cases'))
                        : posts,
                  ),
                ),
              ],
            ),
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
