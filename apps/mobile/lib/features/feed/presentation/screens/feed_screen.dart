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
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';

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
            // Owner 2026-09-30: the animated scales from the welcome
            // screen, header-sized, instead of the text wordmark.
            leading: ExcludeSemantics(
              child: ScalesLogo(
                size: 44,
                animated: true,
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
                _TopicFeed(
                  topic: _topic,
                  onChanged: (v) => setState(() => _topic = v),
                ),
                const AttorneyCasesTab(),
              ],
            )
          : _TopicFeed(
              topic: _topic,
              onChanged: (v) => setState(() => _topic = v),
            ),
    );
  }
}

/// The topic slider above the post stream ("All" = the regular feed).
class _TopicFeed extends StatelessWidget {
  const _TopicFeed({required this.topic, required this.onChanged});

  final String? topic;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          _TopicSlider(value: topic, onChanged: onChanged),
          Expanded(
            child: topic == null
                ? const PostsFeedView()
                : TopicPostsView(key: ValueKey(topic), tag: topic!),
          ),
        ],
      );
}

/// A category's display name: the localized practice tree when loaded,
/// otherwise the English seed name.
String _topicName(WidgetRef ref, String code) {
  final t = ref.read(translatorProvider);
  final tree = ref.watch(practiceTreeProvider).value;
  final cat = tree?.where((c) => c.i18nKey == 'practice.$code').firstOrNull;
  if (cat != null) return CaseFormat.practice(t, cat.i18nKey, cat.nameEn);
  return kPracticeCategoryNamesEn[code] ?? code;
}

/// Owner 2026-09-30: the practice-topic slider above the feed. The filter
/// button on the left lets each user choose which practices it shows
/// (several at once, kept on the device); "All" is the regular feed.
class _TopicSlider extends ConsumerWidget {
  const _TopicSlider({required this.value, required this.onChanged});

  final String? value;
  final ValueChanged<String?> onChanged;

  Future<void> _pick(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('feed.topics.pick'),
      multi: true,
      initial: ref.read(feedTopicsProvider).toSet(),
      options: [
        for (final c in kPracticeCategoryCodes)
          PickerOption(value: c, label: _topicName(ref, c)),
      ],
    );
    if (picked == null) return;
    ref.read(feedTopicsProvider.notifier).set(picked);
    // The open topic was removed from the slider: back to "All".
    final open = value;
    if (open != null && !picked.contains(categoryForTopicTag(open))) {
      onChanged(null);
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final topics = ref.watch(feedTopicsProvider);

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
            duration:
                context.reduceMotion ? Duration.zero : AppMotion.stateChange,
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
                    size: 18, color: selected ? colors.goldLight : colors.text),
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
        // Owner 2026-09-30: starts at the left edge, like the header logo.
        padding: const EdgeInsets.fromLTRB(
            AppSpacing.sm, AppSpacing.sm, AppSpacing.sm, AppSpacing.sm),
        children: [
          Semantics(
            button: true,
            label: t.t('feed.topics.pick'),
            excludeSemantics: true,
            child: AppPressable(
              onTap: () => _pick(context, ref),
              child: Container(
                width: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: colors.surface,
                  shape: BoxShape.circle,
                  border: Border.all(color: colors.border),
                ),
                child:
                    Icon(Icons.tune_rounded, size: 20, color: colors.goldDark),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          chip(null, t.t('feed.topics.all'), Icons.grid_view_rounded),
          for (final c in topics) ...[
            const SizedBox(width: AppSpacing.sm),
            chip(topicTagFor(c), _topicName(ref, c), practiceGlyph(c)),
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
