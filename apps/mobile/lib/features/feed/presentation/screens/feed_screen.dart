import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_cases_tab.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:lawbid/features/chat/presentation/chats_icon_button.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart'
    show topicCategory, topicLabel;

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

  /// Client topic slider (owner 2026-09-30): null = all posts.
  String? _topic;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney;

    // Owner 2026-09-30 header: clients — scales left, "LawBid" centred,
    // chats right; attorneys — "LawBid" left, Posts | Cases centred,
    // chats right.
    final header = attorney
        ? AppFeedHeader(
            logoSemanticLabel: t.t('brand.name'),
            leading: const _Wordmark(size: 22),
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
                size: 34,
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
              children: const [
                PostsFeedView(),
                AttorneyCasesTab(),
              ],
            )
          : Column(
              children: [
                _TopicSlider(
                  value: _topic,
                  onChanged: (v) => setState(() => _topic = v),
                ),
                Expanded(
                  child: _topic == null
                      ? const PostsFeedView()
                      : TopicPostsView(
                          key: ValueKey(_topic),
                          tag: _topic!,
                        ),
                ),
              ],
            ),
    );
  }
}

/// The text wordmark used in the attorney header.
class _Wordmark extends StatelessWidget {
  const _Wordmark({required this.size});

  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return ExcludeSemantics(
      child: Text(
        'LawBid',
        style: TextStyle(
          fontFamily: AppFontFamilies.serif,
          fontSize: size,
          fontWeight: FontWeight.w700,
          color: colors.text,
          height: 1,
        ),
      ),
    );
  }
}

/// Owner 2026-09-30: the clients' practice-topic slider above the feed.
/// Each topic is a hashtag; "All" is the regular feed.
const kFeedTopics = <String>[
  'immigration',
  'familylaw',
  'trafficticket',
  'criminaldefense',
  'dui',
  'personalinjury',
  'realestate',
  'employment',
  'bankruptcy',
];

class _TopicSlider extends ConsumerWidget {
  const _TopicSlider({required this.value, required this.onChanged});

  final String? value;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;

    Widget chip(String? tag, String label, IconData icon) {
      final selected = value == tag;
      return Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        child: AppPressable(
          onTap: () => onChanged(tag),
          child: AnimatedContainer(
            duration: context.reduceMotion
                ? Duration.zero
                : AppMotion.stateChange,
            padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md, vertical: AppSpacing.sm),
            decoration: BoxDecoration(
              color: selected ? colors.navy : colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.pill),
              border: Border.all(
                color: selected ? colors.gold : colors.border,
                width: selected ? 1.5 : 1,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon,
                    size: 18,
                    color: selected ? colors.goldLight : colors.text),
                const SizedBox(width: AppSpacing.xs + 2),
                Text(
                  label,
                  style: type.bodySmall.copyWith(
                    color: selected ? Colors.white : colors.text,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    return SizedBox(
      height: 60,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide, vertical: AppSpacing.sm),
        children: [
          chip(null, t.t('feed.topics.all'), Icons.grid_view_rounded),
          for (final tag in kFeedTopics) ...[
            const SizedBox(width: AppSpacing.sm),
            chip(tag, topicLabel(tag), practiceGlyph(topicCategory(tag))),
          ],
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
