import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/practice/practice_options.dart';

/// A qualification's display name (category or subcategory).
String topicName(WidgetRef ref, String code) => practiceLabel(ref, code);

/// Owner 2026-09-30 (OQ-034): the topic slider above the post feed and
/// the attorney's case feed. The filter button on the left opens "Topics"
/// (which practices the slider shows, several at once, kept on the device)
/// and "State"; a chosen state shows as a removable chip. [category] is a
/// practice category code, null = "All".
class TopicFilterBar extends ConsumerWidget {
  const TopicFilterBar({
    required this.category,
    required this.onCategory,
    required this.stateCode,
    required this.onState,
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
  final String? stateCode;
  final ValueChanged<String?> onState;

  Future<void> _pickTopics(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    // Owner 2026-09-30: every category and subcategory, with suggestions
    // while typing.
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('feed.topics.pick'),
      multi: true,
      searchHint: t.t('practice.search.hint'),
      initial: ref.read(feedTopicsProvider).toSet(),
      // Owner 2026-09-30: "News" is the first item.
      options: [
        PickerOption(
          value: kNewsTopic,
          label: t.t('feed.topics.news'),
        ),
        ...practiceOptions(ref),
      ],
    );
    if (picked == null) return;
    ref.read(feedTopicsProvider.notifier).set(picked);
    // The open topic was removed from the slider: back to "All".
    final open = category;
    if (open != null && !picked.contains(open)) {
      onCategory(null);
    }
  }

  Future<void> _pickState(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('feed.state.pick'),
      initial: {if (stateCode != null) stateCode!},
      options: [
        PickerOption(
          value: '',
          label: t.t(allowedStates == null
              ? 'cases.feed.allStates'
              : 'cases.feed.allLicensedStates'),
        ),
        for (final s in kUsStates)
          if (allowedStates == null || allowedStates!.contains(s.code))
            PickerOption(value: s.code, label: s.name, sublabel: s.code),
      ],
    );
    if (picked == null) return;
    final v = picked.isEmpty ? '' : picked.first;
    onState(v.isEmpty ? null : v);
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
              icon: Icons.grid_view_rounded,
              label: t.t('feed.topics.pick'),
              trailingText: '$count',
              onTap: () => Navigator.of(sheet).pop('topics'),
            ),
            AppListRow(
              icon: Icons.map_outlined,
              label: t.t('feed.state.pick'),
              trailingText: stateCode ?? t.t('cases.feed.allStates'),
              onTap: () => Navigator.of(sheet).pop('state'),
            ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
    if (!context.mounted) return;
    if (choice == 'topics') await _pickTopics(context, ref);
    if (choice == 'state') await _pickState(context, ref);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final topics = ref.watch(feedTopicsProvider);

    Widget pill({
      Key? key,
      required String label,
      required IconData icon,
      required bool selected,
      required VoidCallback onTap,
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
                    color: stateCode != null ? colors.gold : colors.border,
                  ),
                ),
                child:
                    Icon(Icons.tune_rounded, size: 20, color: colors.goldDark),
              ),
            ),
          ),
          if (stateCode != null) ...[
            const SizedBox(width: AppSpacing.sm),
            pill(
              label: usStateByCode(stateCode)?.name ?? stateCode!,
              icon: Icons.place_outlined,
              selected: true,
              onTap: () => onState(null),
              trailing: const Icon(Icons.close_rounded,
                  size: 16, color: Colors.white),
            ),
          ],
          const SizedBox(width: AppSpacing.sm),
          pill(
            label: t.t('feed.topics.all'),
            icon: Icons.grid_view_rounded,
            selected: category == null,
            onTap: () => onCategory(null),
          ),
          if (showNotSure) ...[
            const SizedBox(width: AppSpacing.sm),
            pill(
              key: const ValueKey('topic-not-sure'),
              label: t.t('feed.topics.notSure'),
              icon: Icons.help_outline_rounded,
              selected: category == kNotSureTopic,
              onTap: () => onCategory(kNotSureTopic),
            ),
          ],
          if (showNews && topics.contains(kNewsTopic)) ...[
            const SizedBox(width: AppSpacing.sm),
            pill(
              label: t.t('feed.topics.news'),
              icon: Icons.newspaper_rounded,
              selected: category == kNewsTopic,
              onTap: () => onCategory(kNewsTopic),
            ),
          ],
          for (final c in topics.where((c) =>
              c != kNewsTopic && !(showNotSure && c == kNotSureTopic))) ...[
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
