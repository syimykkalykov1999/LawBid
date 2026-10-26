import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cover.dart';

/// Owner 2026-10-04: the client picks how their case card looks to
/// attorneys: Auto or one of the practice's covers — never their own photo
/// and (owner 2026-10-14) no icon to choose.
class CaseCoverPicker extends StatelessWidget {
  const CaseCoverPicker({
    required this.t,
    required this.practiceCode,
    required this.selected,
    required this.onChanged,
    super.key,
  });

  final Translator t;

  /// Leaf code (`family_law.divorce`); null shows the generic glyph.
  final String? practiceCode;

  /// `art:N` / `icon:<name>`; null = Auto.
  final String? selected;
  final ValueChanged<String?> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final category = practiceCode?.split('.').first;

    Widget frame({
      required bool active,
      required String label,
      required VoidCallback onTap,
      required Widget child,
    }) {
      const radius = AppRadii.card - 4;
      return Semantics(
        button: true,
        selected: active,
        label: label,
        excludeSemantics: true,
        child: AppPressable(
          onTap: onTap,
          child: AnimatedContainer(
            duration:
                context.reduceMotion ? Duration.zero : AppMotion.stateChange,
            padding: const EdgeInsets.all(2.5),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(radius + 2.5),
              border: Border.all(
                color: active ? colors.gold : colors.border,
                width: active ? 2.5 : 1,
              ),
            ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(radius),
              child: child,
            ),
          ),
        ),
      );
    }

    Widget sectionLabel(String text) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Text(
            text,
            style: typography.caption.copyWith(
              color: colors.textSecondary,
              fontWeight: FontWeight.w600,
            ),
          ),
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          t.t('cases.cover.title'),
          style: typography.body.copyWith(
            color: colors.text,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          t.t('cases.cover.subtitle'),
          style: typography.caption.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.md),
        // The chosen cover, as attorneys will see it.
        AspectRatio(
          aspectRatio: 16 / 7,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.card),
            child: selected == null
                ? _AutoPreview(t: t, categoryCode: category)
                : CaseCover(
                    key: ValueKey(selected),
                    categoryCode: category,
                    practiceCode: practiceCode,
                    coverKey: selected,
                  ),
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        sectionLabel(t.t('cases.cover.covers')),
        // Owner 2026-10-14: no icon choice (the icon follows the practice
        // by itself); the four covers share the full width, no empty strip.
        SizedBox(
          height: 72,
          child: Row(
            children: [
              Expanded(
                child: frame(
                  active: selected == null,
                  label: t.t('cases.cover.auto'),
                  onTap: () => onChanged(null),
                  child: SizedBox.expand(
                    child: ColoredBox(
                      color: colors.iconTintFill,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          AppIcon(
                            AppIcons.autoAwesomeOutlined,
                            size: 20,
                            color: colors.iconTint,
                          ),
                          const SizedBox(height: 2),
                          Text(
                            t.t('cases.cover.auto'),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: typography.caption.copyWith(
                              color: colors.text,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              for (var v = 0; v < kCaseCoverVariants; v++) ...[
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: frame(
                    active: selected == coverArtKey(v),
                    label: t.t('cases.cover.option', {'n': '${v + 1}'}),
                    onTap: () => onChanged(coverArtKey(v)),
                    child: SizedBox.expand(
                      child: CaseCover(
                        categoryCode: category,
                        practiceCode: practiceCode,
                        coverKey: coverArtKey(v),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

/// "Auto": a peek at three of the practice's covers.
class _AutoPreview extends StatelessWidget {
  const _AutoPreview({required this.t, required this.categoryCode});

  final Translator t;
  final String? categoryCode;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Stack(
      fit: StackFit.expand,
      children: [
        Row(
          children: [
            for (final v in const [1, 2, 3])
              Expanded(
                child: CaseCover(
                  categoryCode: categoryCode,
                  coverKey: coverArtKey(v),
                ),
              ),
          ],
        ),
        Align(
          alignment: AlignmentDirectional.bottomStart,
          child: Container(
            margin: const EdgeInsets.all(AppSpacing.sm),
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm + 2,
              vertical: AppSpacing.xs,
            ),
            decoration: BoxDecoration(
              color: colors.navy.withValues(alpha: 0.85),
              borderRadius: BorderRadius.circular(AppRadii.pill),
              border: Border.all(color: colors.gold),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                AppIcon(
                  AppIcons.autoAwesomeOutlined,
                  size: 14,
                  color: colors.iconTint,
                ),
                const SizedBox(width: AppSpacing.xs),
                Text(
                  t.t('cases.cover.auto'),
                  style: typography.caption.copyWith(
                    color: colors.goldLight,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
