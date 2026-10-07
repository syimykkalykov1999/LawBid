import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/feed/application/feed_content.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/feed/application/news_flag.dart';
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
    super.key,
  });

  /// Audit 2026-10-01: the case feed only shows cases in the attorney's
  /// verified-license states — the picker lists just those.
  final List<String>? allowedStates;

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

  Future<void> _pickTopics(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    // Owner 2026-09-30: every category and subcategory, with suggestions
    // while typing.
    final scope = ref.read(feedLegalScopeProvider);
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('feed.topics.pick'),
      multi: true,
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
    if (picked == null) return;
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
  }

  Future<void> _pickState(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    if (_multiState) {
      // Owner 2026-10-06: several states at once; none picked = all.
      final picked = await OptionPickerSheet.show(
        context,
        title: t.t('feed.state.pick'),
        multi: true,
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
      if (picked != null) onStates!(picked);
      return;
    }
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('feed.state.pick'),
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
    if (picked == null) return;
    final v = picked.isEmpty ? '' : picked.first;
    onState?.call(v.isEmpty ? null : v);
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
              icon: AppIcons.gridViewRounded,
              label: t.t('feed.topics.pick'),
              trailingText: '$count',
              onTap: () => Navigator.of(sheet).pop('topics'),
            ),
            AppListRow(
              icon: AppIcons.mapOutlined,
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
    if (choice == 'topics') await _pickTopics(context, ref);
    // ignore: use_build_context_synchronously
    if (choice == 'state') await _pickState(context, ref);
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
      required IconData icon,
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
            child: AnimatedContainer(
              duration:
                  context.reduceMotion ? Duration.zero : AppMotion.stateChange,
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
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
                  AppIcon(
                    icon,
                    size: 18,
                    color: selected ? colors.goldLight : colors.text,
                  ),
                  const SizedBox(width: AppSpacing.xs + 2),
                  // Capped: a long qualification name ends with "…" instead
                  // of a pill wider than the screen.
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 220),
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.bodySmall.copyWith(
                        color: selected ? Colors.white : colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  if (trailing != null) ...[
                    const SizedBox(width: AppSpacing.xs),
                    trailing,
                  ],
                ],
              ),
            ),
          ),
        );

    return SizedBox(
      height: 60,
      child: ListView(
        scrollDirection: Axis.horizontal,
        // Owner 2026-09-30: starts at the left edge, like the header logo.
        padding: const EdgeInsets.all(AppSpacing.sm),
        children: [
          Semantics(
            button: true,
            label: t.t('feed.filters'),
            excludeSemantics: true,
            child: AppPressable(
              onTap: () => _openFilters(context, ref),
              child: Container(
                width: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: colors.surface,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: _hasState ? colors.gold : colors.border,
                    width: _hasState ? 1.5 : 1,
                  ),
                ),
                child: AppIcon(
                  AppIcons.tuneRounded,
                  size: 20,
                  color: colors.goldDark,
                ),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          // Owner 2026-10-06: "All" = every post, no topic; "Legal posts"
          // right after it = legal posts only (the same setting as
          // Filters → Content), then the topics.
          pill(
            key: const ValueKey('feed-all'),
            label: t.t('feed.topics.all'),
            icon: AppIcons.gridViewRounded,
            selected: category == null && !legalOnly,
            onTap: () {
              onCategory(null);
              if (legalOnly) _setContent(context, ref, FeedContentMode.all);
            },
          ),
          if (showNews) ...[
            const SizedBox(width: AppSpacing.sm),
            pill(
              key: const ValueKey('feed-legal-posts'),
              label: t.t('feed.legalPosts'),
              icon: AppIcons.gavelRounded,
              selected: legalOnly,
              onTap: () => _setContent(
                context,
                ref,
                legalOnly ? FeedContentMode.all : FeedContentMode.legalOnly,
              ),
            ),
          ],
          if (showNotSure) ...[
            const SizedBox(width: AppSpacing.sm),
            pill(
              key: const ValueKey('topic-not-sure'),
              label: t.t('feed.topics.notSure'),
              icon: AppIcons.helpOutlineRounded,
              selected: category == kNotSureTopic,
              onTap: () => onCategory(kNotSureTopic),
            ),
          ],
          if (showNews && newsOn && topics.contains(kNewsTopic)) ...[
            const SizedBox(width: AppSpacing.sm),
            pill(
              label: t.t('feed.topics.news'),
              icon: AppIcons.newspaperRounded,
              selected: category == kNewsTopic,
              onTap: () => onCategory(kNewsTopic),
            ),
          ],
          // Owner 2026-10-07: the "Posts" topic is gone everywhere.
          for (final c in topics.where(
            (c) => c != kNewsTopic && !(showNotSure && c == kNotSureTopic),
          )) ...[
            const SizedBox(width: AppSpacing.sm),
            pill(
              label: topicName(ref, c),
              icon: practiceGlyph(practiceCategoryOf(c)),
              selected: category == c,
              onTap: () => onCategory(c),
            ),
          ],
        ],
      ),
    );
  }
}
