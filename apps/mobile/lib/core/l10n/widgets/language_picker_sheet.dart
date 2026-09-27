import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/language_catalog.dart';
import 'package:lawbid/core/l10n/language_catalog_provider.dart';
import 'package:lawbid/core/l10n/language_providers.dart';

/// Search + list language picker (2026-09-22 owner voice follow-up):
/// tapping the welcome screen's globe icon used to toggle ru<->en directly;
/// the owner asked for a proper picker instead — search field on top, list
/// below, "most popular first" — sized to grow as more languages are added
/// (see `language_catalog.dart`'s doc comment) without another redesign.
///
/// Only the catalog rows with a non-null [LanguageCatalogEntry.appLanguage]
/// are actually selectable today (`ru`, `en`); the rest render dimmed with
/// a "coming soon" trailing badge. The list itself is now backend-driven
/// (`languageCatalogProvider`, GET /i18n/languages — see
/// language_catalog_provider.dart) with the compiled-in
/// `kLanguageCatalog` as its offline/loading fallback, so a language the
/// backend adds shows up here (as "coming soon" until it also gets an
/// [AppLanguage] case + real strings) without an app update.
class LanguagePickerSheet extends ConsumerStatefulWidget {
  const LanguagePickerSheet({super.key});

  /// Opens the sheet. Selecting an enabled language sets it and pops;
  /// tapping outside / dragging down dismisses without changing anything.
  static Future<void> show(BuildContext context) {
    return showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const LanguagePickerSheet(),
    );
  }

  @override
  ConsumerState<LanguagePickerSheet> createState() =>
      _LanguagePickerSheetState();
}

class _LanguagePickerSheetState extends ConsumerState<LanguagePickerSheet> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  /// [catalog] is `languageCatalogProvider`'s current value when it has
  /// one — see [build] below for why a still-loading/errored fetch falls
  /// back to the compiled-in [kLanguageCatalog] rather than an empty list
  /// or a spinner (owner request was "search + list", not a loading
  /// state).
  List<LanguageCatalogEntry> _filtered(List<LanguageCatalogEntry> catalog) {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return catalog;
    return catalog.where((entry) {
      return entry.nativeName.toLowerCase().contains(q) ||
          entry.englishName.toLowerCase().contains(q) ||
          entry.code.toLowerCase().contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final currentLanguage =
        ref.watch(languageControllerProvider).value ?? AppLanguage.en;
    // Backend-driven catalog (GET /i18n/languages, see
    // language_catalog_provider.dart), falling back to the compiled-in
    // kLanguageCatalog while the fetch is in flight or if it fails — same
    // "never block/blank the UI on network" principle as the translator
    // layer itself.
    final catalog =
        ref.watch(languageCatalogProvider).value ?? kLanguageCatalog;
    final results = _filtered(catalog);

    return SafeArea(
      top: false,
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.75,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.sm,
            AppSpacing.screenSide,
            AppSpacing.md,
          ),
          child: Column(
            children: [
              const AppSheetHandle(),
              Semantics(
                header: true,
                child: Text(
                  t.t('lang.picker.title'),
                  style: typography.titleMedium.copyWith(color: colors.text),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _searchController,
                leading:
                    Icon(Icons.search, size: 20, color: colors.textSecondary),
                hintText: t.t('lang.picker.search.hint'),
                autofocus: true,
                onChanged: (value) => setState(() => _query = value),
                semanticLabel: t.t('lang.picker.search.hint'),
              ),
              const SizedBox(height: AppSpacing.sm),
              Expanded(
                child: results.isEmpty
                    ? AppEmptyState(
                        icon: Icons.search_off_rounded,
                        message: t.t('lang.picker.empty'),
                      )
                    : ListView.separated(
                        itemCount: results.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(height: AppSpacing.sm),
                        itemBuilder: (context, index) {
                          final entry = results[index];
                          final isCurrent = entry.isEnabled &&
                              entry.appLanguage == currentLanguage;
                          final row = _LanguageRow(
                            entry: entry,
                            isCurrent: isCurrent,
                            comingSoonLabel: t.t('lang.picker.comingSoon'),
                            onTap: entry.isEnabled
                                ? () {
                                    ref
                                        .read(
                                          languageControllerProvider.notifier,
                                        )
                                        .setLanguage(entry.appLanguage!);
                                    Navigator.of(context).pop();
                                  }
                                : null,
                          );
                          // Stagger only the first screenful; rows scrolled
                          // into view later appear without delay.
                          return index < 8
                              ? AppEntrance(index: index, child: row)
                              : row;
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _LanguageRow extends StatelessWidget {
  const _LanguageRow({
    required this.entry,
    required this.isCurrent,
    required this.comingSoonLabel,
    required this.onTap,
  });

  final LanguageCatalogEntry entry;
  final bool isCurrent;
  final String comingSoonLabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final enabled = onTap != null;

    return Semantics(
      button: enabled,
      enabled: enabled,
      selected: isCurrent,
      label: '${entry.nativeName}, ${entry.englishName}',
      excludeSemantics: true,
      child: Opacity(
        opacity: enabled ? 1.0 : 0.45,
        child: AppPressable(
          onTap: onTap,
          child: AnimatedContainer(
            duration:
                context.reduceMotion ? Duration.zero : AppMotion.stateChange,
            curve: AppMotion.enterCurve,
            constraints: const BoxConstraints(
              minHeight: AppSizes.touchTarget + AppSpacing.md,
            ),
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm,
            ),
            decoration: BoxDecoration(
              color: isCurrent ? colors.goldTint : colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.field),
              border:
                  Border.all(color: isCurrent ? colors.gold : colors.border),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        entry.nativeName,
                        style: typography.body.copyWith(
                          color: colors.text,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      Text(
                        entry.englishName,
                        style: typography.caption
                            .copyWith(color: colors.textSecondary),
                      ),
                    ],
                  ),
                ),
                if (isCurrent)
                  Icon(
                    Icons.check_circle_rounded,
                    size: AppSizes.iconSm,
                    color: colors.goldStroke,
                  )
                else if (!enabled)
                  Text(
                    comingSoonLabel,
                    style: typography.caption
                        .copyWith(color: colors.textSecondary),
                  )
                else
                  Text(
                    entry.code.toUpperCase(),
                    style: typography.caption
                        .copyWith(color: colors.textSecondary),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
