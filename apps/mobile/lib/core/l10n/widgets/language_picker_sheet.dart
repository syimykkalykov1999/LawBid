import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../design_system/design_system.dart';
import '../app_language.dart';
import '../l10n_providers.dart';
import '../language_catalog.dart';
import '../language_providers.dart';

/// Search + list language picker (2026-09-22 owner voice follow-up):
/// tapping the welcome screen's globe icon used to toggle ru<->en directly;
/// the owner asked for a proper picker instead — search field on top, list
/// below, "most popular first" — sized to grow as more languages are added
/// (see `language_catalog.dart`'s doc comment) without another redesign.
///
/// Only the catalog rows with a non-null [LanguageCatalogEntry.appLanguage]
/// are actually selectable today (`ru`, `en`); the rest render dimmed with
/// a "coming soon" trailing badge so the owner can see the intended full
/// list shape immediately, ahead of stage 1.6 actually adding them.
class LanguagePickerSheet extends ConsumerStatefulWidget {
  const LanguagePickerSheet({super.key});

  /// Opens the sheet. Selecting an enabled language sets it and pops;
  /// tapping outside / dragging down dismisses without changing anything.
  static Future<void> show(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: colors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.roleCard)),
      ),
      builder: (_) => const LanguagePickerSheet(),
    );
  }

  @override
  ConsumerState<LanguagePickerSheet> createState() => _LanguagePickerSheetState();
}

class _LanguagePickerSheetState extends ConsumerState<LanguagePickerSheet> {
  final _searchController = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  List<LanguageCatalogEntry> _filtered() {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return kLanguageCatalog;
    return kLanguageCatalog.where((entry) {
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
    final currentLanguage = ref.watch(languageControllerProvider).value ?? AppLanguage.en;
    final results = _filtered();

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
              Center(
                child: Container(
                  width: 36,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: AppSpacing.md),
                  decoration: BoxDecoration(
                    color: colors.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Text(
                t.t('lang.picker.title'),
                style: typography.titleMedium.copyWith(color: colors.text),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _searchController,
                leading: Icon(Icons.search, size: 20, color: colors.textSecondary),
                hintText: t.t('lang.picker.search.hint'),
                autofocus: true,
                onChanged: (value) => setState(() => _query = value),
                semanticLabel: t.t('lang.picker.search.hint'),
              ),
              const SizedBox(height: AppSpacing.sm),
              Expanded(
                child: results.isEmpty
                    ? Center(
                        child: Text(
                          t.t('lang.picker.empty'),
                          style: typography.body.copyWith(color: colors.textSecondary),
                        ),
                      )
                    : ListView.separated(
                        itemCount: results.length,
                        separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.xs),
                        itemBuilder: (context, index) {
                          final entry = results[index];
                          final isCurrent =
                              entry.isEnabled && entry.appLanguage == currentLanguage;
                          return _LanguageRow(
                            entry: entry,
                            isCurrent: isCurrent,
                            comingSoonLabel: t.t('lang.picker.comingSoon'),
                            onTap: entry.isEnabled
                                ? () {
                                    ref
                                        .read(languageControllerProvider.notifier)
                                        .setLanguage(entry.appLanguage!);
                                    Navigator.of(context).pop();
                                  }
                                : null,
                          );
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
      child: Opacity(
        opacity: enabled ? 1.0 : 0.45,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadii.field),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.sm,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(entry.nativeName, style: typography.body.copyWith(color: colors.text)),
                      Text(
                        entry.englishName,
                        style: typography.caption.copyWith(color: colors.textSecondary),
                      ),
                    ],
                  ),
                ),
                if (isCurrent)
                  Icon(Icons.check, size: 20, color: colors.gold)
                else if (!enabled)
                  Text(
                    comingSoonLabel,
                    style: typography.caption.copyWith(color: colors.textSecondary),
                  )
                else
                  Text(
                    entry.code.toUpperCase(),
                    style: typography.caption.copyWith(color: colors.textSecondary),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
