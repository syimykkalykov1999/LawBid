import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// The sheet that lists the themes (owner 2026-10-13): handle, title, one
/// row per theme from [AppThemes] with its swatch, the chosen one with a
/// gold frame and a check. Same look as the language sheet (it uses the
/// same [AppPickerRow]); opened from the welcome screen's theme icon and
/// from Settings → Theme. Picking applies at once and closes the sheet.
class ThemePickerSheet extends ConsumerWidget {
  const ThemePickerSheet({super.key});

  static Future<void> show(BuildContext context) => showAppBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => const ThemePickerSheet(),
      );

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    // Never chosen: the phone decides between Day and Night.
    final chosen = ref.watch(appThemeControllerProvider) ??
        AppThemes.autoFor(MediaQuery.platformBrightnessOf(context));
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.sm,
          AppSpacing.screenSide,
          AppSpacing.md,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            Semantics(
              header: true,
              child: Text(
                t.t('settings.theme'),
                style: typography.titleMedium.copyWith(color: colors.text),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            for (final (i, spec) in AppThemes.all.indexed) ...[
              if (i > 0) const SizedBox(height: AppSpacing.sm),
              AppEntrance(
                index: i,
                child: AppPickerRow(
                  title: t.t(spec.nameKey),
                  subtitle: t.t(spec.descKey),
                  selected: spec.id == chosen,
                  leading: ThemeSwatch(spec: spec),
                  onTap: () {
                    ref.read(appThemeControllerProvider.notifier).select(
                          spec.id,
                        );
                    Navigator.of(context).pop();
                  },
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// A theme's miniature (its background, a title bar and an accent line).
class ThemeSwatch extends StatelessWidget {
  const ThemeSwatch({required this.spec, super.key});

  final AppThemeSpec spec;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final gradient = spec.previewBgGradient;
    return Container(
      width: 44,
      height: 32,
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 6),
      decoration: BoxDecoration(
        color: gradient == null ? spec.previewBg : null,
        gradient: gradient == null
            ? null
            : LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: gradient,
              ),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            height: 4,
            decoration: BoxDecoration(
              color: spec.previewTitle,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const Spacer(),
          Container(
            width: 16,
            height: 4,
            decoration: BoxDecoration(
              color: spec.previewAccent,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
        ],
      ),
    );
  }
}
