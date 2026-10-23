import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/bars/app_bottom_nav.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_pressable.dart';

/// Owner 2026-10-15 (web): on a wide screen the bottom bar becomes a column
/// of the same four tabs at the left edge (the right edge in RTL), like
/// Instagram on the web: icons only when [extended] is false, icon and name
/// when it is true. The "+" create action sits under the tabs.
class AppSideNav extends StatelessWidget {
  const AppSideNav({
    required this.tabs,
    required this.currentIndex,
    required this.onTabSelected,
    required this.onCreatePressed,
    required this.extended,
    super.key,
    this.createLabel = 'Create',
  }) : assert(tabs.length == 4, 'AppSideNav expects exactly 4 tabs');

  final List<AppTabConfig> tabs;
  final int currentIndex;
  final ValueChanged<int> onTabSelected;
  final VoidCallback onCreatePressed;
  final bool extended;
  final String createLabel;

  /// Width of the column.
  static double widthFor({required bool extended}) => extended ? 220 : 76;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;

    Widget item({
      required IconData icon,
      required String label,
      required bool selected,
      required VoidCallback onTap,
      required Key key,
    }) {
      final color = selected ? colors.goldAccent : colors.textSecondary;
      return Semantics(
        button: true,
        selected: selected,
        label: label,
        excludeSemantics: true,
        child: AppPressable(
          onTap: onTap,
          child: Container(
            key: key,
            height: AppSizes.touchTarget + 4,
            margin: const EdgeInsets.symmetric(vertical: 2),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            decoration: BoxDecoration(
              color: selected ? colors.chip : Colors.transparent,
              borderRadius: BorderRadius.circular(AppRadii.field),
            ),
            child: Row(
              mainAxisAlignment:
                  extended ? MainAxisAlignment.start : MainAxisAlignment.center,
              children: [
                AppIcon(icon, size: AppSizes.iconLg, color: color),
                if (extended) ...[
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: typography.body.copyWith(
                        color: selected ? colors.text : colors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    }

    return SizedBox(
      width: widthFor(extended: extended),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.bg,
          border: BorderDirectional(end: BorderSide(color: colors.border)),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.sm,
              vertical: AppSpacing.lg,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < tabs.length; i++)
                  item(
                    key: ValueKey('side-nav-tab-$i'),
                    icon: i == currentIndex ? tabs[i].activeIcon : tabs[i].icon,
                    label: tabs[i].label,
                    selected: i == currentIndex,
                    onTap: () {
                      if (i != currentIndex) HapticFeedback.selectionClick();
                      onTabSelected(i);
                    },
                  ),
                const SizedBox(height: AppSpacing.md),
                item(
                  key: const ValueKey('side-nav-create'),
                  icon: AppIcons.addRounded,
                  label: createLabel,
                  selected: false,
                  onTap: onCreatePressed,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
