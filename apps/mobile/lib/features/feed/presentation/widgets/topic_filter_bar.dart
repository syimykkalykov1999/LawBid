import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/feed/application/feed_content.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/feed/application/news_flag.dart';
import 'package:lawbid/features/feed/presentation/widgets/feed_chrome.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/practice/practice_options.dart';

/// A qualification's display name (category or subcategory).
String topicName(WidgetRef ref, String code) => practiceLabel(ref, code);

/// Owner 2026-10-04: the state picker value for "all my licensed states".
const kMyLicensedStates = '*licensed';

/// Owner 2026-10-06: the «Юр. посты» group first in «Выберите темы» — a
/// one-of choice of what the «Юр. посты» pill shows.
const kLegalGroup = '@legal';
const kLegalAll = '@legal:all';
const kLegalMine = '@legal:mine';

/// Height of the topic row (owner 2026-10-12: a slim Temu-style row).
const double kTopicBarHeight = 36;

/// Owner 2026-09-30 (OQ-034): the topic slider above the post feed and
/// the attorney's case feed. The filter button on the left opens "Topics"
/// (which practices the slider shows, several at once, kept on the device)
/// and "State" (owner 2026-10-06: the filter button turns gold; no state
/// chip in the slider). [category] is a practice category code, null =
/// "All".
class TopicFilterBar extends ConsumerWidget {
  const TopicFilterBar({
    required this.category,
    required this.onCategory,
    this.stateCode,
    this.onState,
    this.stateCodes,
    this.onStates,
    this.showNews = true,
    this.showNotSure = false,
    this.allowedStates,
    this.onDark = false,
    super.key,
  });

  /// Audit 2026-10-01: the case feed only shows cases in the attorney's
  /// verified-license states — the picker lists just those.
  final List<String>? allowedStates;

  /// Owner 2026-10-12: over the Reels video — white text, always shown.
  final bool onDark;

  /// The "News" pill (the post feed; not the attorney's case feed).
  final bool showNews;

  /// Owner 2026-10-01: "Not sure" cases first (the attorney's case feed).
  final bool showNotSure;

  final String? category;
  final ValueChanged<String?> onCategory;

  /// One state (the attorney's case feed).
  final String? stateCode;
  final ValueChanged<String?>? onState;

  /// Owner 2026-10-06: several states at once (the post feed); used when
  /// [onStates] is set.
  final Set<String>? stateCodes;
  final ValueChanged<Set<String>>? onStates;

  bool get _multiState => onStates != null;

  bool get _hasState =>
      _multiState ? (stateCodes ?? const {}).isNotEmpty : stateCode != null;

  /// True when the user stepped back (to the filters menu).
  Future<bool> _pickTopics(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    // Owner 2026-09-30: every category and subcategory, with suggestions
    // while typing.
    final scope = ref.read(feedLegalScopeProvider);
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('feed.topics.pick'),
      multi: true,
      back: true,
      searchHint: t.t('practice.search.hint'),
      initial: {
        ...ref.read(feedTopicsProvider),
        if (showNews && scope == FeedLegalScope.mine)
          kLegalMine
        else if (showNews)
          kLegalAll,
      },
      // Owner 2026-09-30: "News" is the first item; owner 2026-10-05:
      // "Posts" (general, personal posts) right below it; owner
      // 2026-10-06: «Юр. посты» (what that pill shows) above them all.
      options: [
        if (showNews) ...[
          PickerOption(
            value: kLegalGroup,
            label: t.t('feed.legalPosts'),
            exclusive: true,
          ),
          PickerOption(
            value: kLegalAll,
            label: t.t('feed.legal.all'),
            group: t.t('feed.legalPosts'),
            nested: true,
          ),
          PickerOption(
            value: kLegalMine,
            label: t.t('feed.legal.mine'),
            group: t.t('feed.legalPosts'),
            nested: true,
          ),
        ],
        // Owner 2026-10-06: News is off for now (flag `news_posts`).
        if (showNews && ref.read(newsEnabledProvider))
          PickerOption(
            value: kNewsTopic,
            label: t.t('feed.topics.news'),
          ),
        ...practiceOptions(ref),
      ],
    );
    if (picked == null) return false;
    if (identical(picked, OptionPickerSheet.backResult)) return true;
    if (showNews) {
      ref.read(feedLegalScopeProvider.notifier).set(
            picked.contains(kLegalMine)
                ? FeedLegalScope.mine
                : FeedLegalScope.all,
          );
    }
    final topics = picked.difference({kLegalGroup, kLegalAll, kLegalMine});
    // A hidden News choice stays as it was (it comes back with the flag).
    final keepNews = !ref.read(newsEnabledProvider) &&
        ref.read(feedTopicsProvider).contains(kNewsTopic);
    ref
        .read(feedTopicsProvider.notifier)
        .set({...topics, if (keepNews) kNewsTopic});
    // The open topic was removed from the slider: back to "All".
    final open = category;
    if (open != null && !topics.contains(open)) {
      onCategory(null);
    }
    return false;
  }

  /// True when the user stepped back (to the filters menu).
  Future<bool> _pickState(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    if (_multiState) {
      // Owner 2026-10-06: several states at once; none picked = all.
      final picked = await OptionPickerSheet.show(
        context,
        title: t.t('feed.state.pick'),
        multi: true,
        back: true,
        initial: {...?stateCodes},
        options: [
          // The attorney's own licensed states as a group (case feed).
          if (allowedStates != null)
            PickerOption(
              value: kMyLicensedStates,
              label: t.t('cases.feed.allLicensedStates'),
            ),
          for (final s in kRegions)
            PickerOption(value: s.code, label: s.name, sublabel: s.code),
        ],
      );
      if (picked != null && identical(picked, OptionPickerSheet.backResult)) {
        return true;
      }
      if (picked != null) onStates!(picked);
      return false;
    }
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('feed.state.pick'),
      back: true,
      initial: {if (stateCode != null) stateCode!},
      options: [
        PickerOption(value: '', label: t.t('cases.feed.allStates')),
        // Owner 2026-10-04: the attorney's own licensed states as a group,
        // then every state (viewing is open, offers need a licence).
        if (allowedStates != null)
          PickerOption(
            value: kMyLicensedStates,
            label: t.t('cases.feed.allLicensedStates'),
          ),
        for (final s in kRegions)
          PickerOption(value: s.code, label: s.name, sublabel: s.code),
      ],
    );
    if (picked == null) return false;
    if (identical(picked, OptionPickerSheet.backResult)) return true;
    final v = picked.isEmpty ? '' : picked.first;
    onState?.call(v.isEmpty ? null : v);
    return false;
  }

  /// The filter sheet's state row: "All states", "IL", or "IL, NY, CA +2".
  String _stateSummary(Translator t) {
    if (!_multiState) {
      return stateCode == kMyLicensedStates
          ? t.t('cases.feed.allLicensedStates')
          : stateCode ?? t.t('cases.feed.allStates');
    }
    final picked = stateCodes ?? const <String>{};
    final codes = [
      if (picked.contains(kMyLicensedStates))
        t.t('cases.feed.allLicensedStates'),
      ...(picked.where((c) => c != kMyLicensedStates).toList()..sort()),
    ];
    if (codes.isEmpty) return t.t('cases.feed.allStates');
    final shown = codes.take(3).join(', ');
    return codes.length > 3 ? '$shown +${codes.length - 3}' : shown;
  }

  Future<void> _setContent(
    BuildContext context,
    WidgetRef ref,
    FeedContentMode next,
  ) async {
    final t = ref.read(translatorProvider);
    // The Posts topic lists only general posts: back to "All".
    if (next == FeedContentMode.legalOnly && category == kGeneralPostsTopic) {
      onCategory(null);
    }
    try {
      await ref.read(feedContentModeProvider.notifier).set(next);
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _openFilters(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    final count = ref.read(feedTopicsProvider).length;
    final choice = await showAppBottomSheet<String>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            AppListRow(
              label: t.t('feed.topics.pick'),
              trailingText: '$count',
              onTap: () => Navigator.of(sheet).pop('topics'),
            ),
            AppListRow(
              label: t.t('feed.state.pick'),
              trailingText: _stateSummary(t),
              onTap: () => Navigator.of(sheet).pop('state'),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
    if (!context.mounted) return;
    var back = false;
    if (choice == 'topics') back = await _pickTopics(context, ref);
    // ignore: use_build_context_synchronously
    if (choice == 'state') back = await _pickState(context, ref);
    // Owner 2026-10-12: back from a picker returns to the filters menu.
    // ignore: use_build_context_synchronously
    if (back && context.mounted) await _openFilters(context, ref);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final topics = ref.watch(feedTopicsProvider);
    final legalOnly = showNews &&
        ref.watch(feedContentModeProvider) == FeedContentMode.legalOnly;
    final newsOn = ref.watch(newsEnabledProvider);

    Widget pill({
      required String label,
      required bool selected,
      required VoidCallback onTap,
      Key? key,
      Widget? trailing,
    }) =>
        Semantics(
          key: key,
          button: true,
          selected: selected,
          label: label,
          excludeSemantics: true,
          child: AppPressable(
            onTap: onTap,
            // Owner 2026-10-12 (Temu): plain text tabs, no frame or fill;
            // the open one is bold with a short bar under it.
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Spacer(),
                  // Capped: a long qualification name ends with "…".
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 220),
                    // A slim tab row: the text grows only up to 1.2x.
                    child: MediaQuery.withClampedTextScaling(
                      maxScaleFactor: 1.2,
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.bodySmall.copyWith(
                          color: onDark
                              ? (selected
                                  ? Colors.white
                                  : Colors.white.withValues(alpha: 0.7))
                              : (selected ? colors.text : colors.textSecondary),
                          fontWeight:
                              selected ? FontWeight.w700 : FontWeight.w500,
                        ),
                      ),
                    ),
                  ),
                  if (trailing != null) trailing,
                  const SizedBox(height: 4),
                  AnimatedContainer(
                    duration: context.reduceMotion
                        ? Duration.zero
                        : AppMotion.stateChange,
                    width: selected ? 18 : 0,
                    height: 2.5,
                    decoration: BoxDecoration(
                      color: onDark ? Colors.white : colors.gold,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 3),
                ],
              ),
            ),
          ),
        );

    return _Chrome(
      collapse: !onDark,
      child: SizedBox(
        height: kTopicBarHeight,
        child: ListView(
          scrollDirection: Axis.horizontal,
          // Owner 2026-09-30: starts at the left edge, like the header logo.
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
          children: [
            Semantics(
              button: true,
              label: t.t('feed.filters'),
              excludeSemantics: true,
              child: AppPressable(
                onTap: () => _openFilters(context, ref),
                child: SizedBox(
                  width: 36,
                  child: Center(
                    child: AppIcon(
                      AppIcons.tuneRounded,
                      size: 20,
                      // Gold while a state narrows the feed.
                      color: _hasState
                          ? colors.gold
                          : (onDark ? Colors.white : colors.text),
                    ),
                  ),
                ),
              ),
            ),
            // Owner 2026-10-06: "All" = every post, no topic; "Legal posts"
            // right after it = legal posts only (the same setting as
            // Filters → Content), then the topics.
            pill(
              key: const ValueKey('feed-all'),
              label: t.t('feed.topics.all'),
              selected: category == null && !legalOnly,
              onTap: () {
                onCategory(null);
                if (legalOnly) _setContent(context, ref, FeedContentMode.all);
              },
            ),
            if (showNews) ...[
              pill(
                key: const ValueKey('feed-legal-posts'),
                label: t.t('feed.legalPosts'),
                selected: legalOnly,
                onTap: () => _setContent(
                  context,
                  ref,
                  legalOnly ? FeedContentMode.all : FeedContentMode.legalOnly,
                ),
              ),
            ],
            if (showNotSure) ...[
              pill(
                key: const ValueKey('topic-not-sure'),
                label: t.t('feed.topics.notSure'),
                selected: category == kNotSureTopic,
                onTap: () => onCategory(kNotSureTopic),
              ),
            ],
            if (showNews && newsOn && topics.contains(kNewsTopic)) ...[
              pill(
                label: t.t('feed.topics.news'),
                selected: category == kNewsTopic,
                onTap: () => onCategory(kNewsTopic),
              ),
            ],
            // Owner 2026-10-07: the "Posts" topic is gone everywhere.
            for (final c in topics.where(
              (c) => c != kNewsTopic && !(showNotSure && c == kNotSureTopic),
            )) ...[
              pill(
                label: topicName(ref, c),
                selected: category == c,
                onTap: () => onCategory(c),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Chrome extends StatelessWidget {
  const _Chrome({required this.collapse, required this.child});

  final bool collapse;
  final Widget child;

  @override
  Widget build(BuildContext context) =>
      collapse ? ChromeCollapse(child: child) : child;
}
