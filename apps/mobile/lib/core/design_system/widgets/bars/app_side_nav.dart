import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/bars/app_bottom_nav.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_pressable.dart';
import 'package:lawbid/core/design_system/widgets/motion/hover_surface.dart';

/// Desktop web plan 2026-10-28 §5.2 (owner Q1, 2026-10-28: yes): an item of
/// the computer's side menu that the phone's bar does not have — Messages
/// and Notifications, each with its count.
class AppSideNavExtra {
  const AppSideNavExtra({
    required this.key,
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.onTap,
    this.count = 0,
    this.selected = false,
  });

  final Key key;
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final VoidCallback onTap;

  /// The unread count (0 = no pill).
  final int count;
  final bool selected;
}

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
    this.messages,
    this.notifications,
  }) : assert(tabs.length == 4, 'AppSideNav expects exactly 4 tabs');

  final List<AppTabConfig> tabs;
  final int currentIndex;
  final ValueChanged<int> onTabSelected;
  final VoidCallback onCreatePressed;
  final bool extended;
  final String createLabel;

  /// Desktop web plan §5.2: the computer's extra items (null = none, as on
  /// a tablet-width window). With them the order is Instagram's: Feed,
  /// Search, Messages, Mine, Notifications, Create, Profile.
  final AppSideNavExtra? messages;
  final AppSideNavExtra? notifications;

  /// Width of the column.
  static double widthFor({required bool extended}) => extended ? 220 : 76;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final extras = messages != null || notifications != null;

    Widget item({
      required IconData icon,
      required String label,
      required bool selected,
      required VoidCallback onTap,
      required Key key,
      int count = 0,
    }) {
      final color = selected ? colors.goldAccent : colors.textSecondary;
      final pill = count <= 0
          ? null
          : Container(
              key: ValueKey('side-nav-count-${(key as ValueKey).value}'),
              constraints: const BoxConstraints(minWidth: 18),
              height: 18,
              padding: const EdgeInsets.symmetric(horizontal: 5),
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: colors.gold,
                borderRadius: BorderRadius.circular(AppRadii.pill),
              ),
              child: Text(
                count > 99 ? '99+' : '$count',
                style: typography.badge.copyWith(color: colors.navy),
              ),
            );
      final iconWidget = AppIcon(icon, size: AppSizes.iconLg, color: color);
      return Semantics(
        button: true,
        selected: selected,
        label: count > 0 ? '$label, $count' : label,
        excludeSemantics: true,
        child: AppPressable(
          onTap: onTap,
          child: _hoverable(
            Container(
              key: key,
              height: AppSizes.touchTarget + 4,
              margin: const EdgeInsets.symmetric(vertical: 2),
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
              decoration: BoxDecoration(
                color: selected ? colors.chip : Colors.transparent,
                borderRadius: BorderRadius.circular(AppRadii.field),
              ),
              child: Row(
                mainAxisAlignment: extended
                    ? MainAxisAlignment.start
                    : MainAxisAlignment.center,
                children: [
                  if (pill != null && !extended)
                    Stack(
                      clipBehavior: Clip.none,
                      children: [
                        iconWidget,
                        PositionedDirectional(top: -6, end: -10, child: pill),
                      ],
                    )
                  else
                    iconWidget,
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
                    if (pill != null) pill,
                  ],
                ],
              ),
            ),
            extras,
          ),
        ),
      );
    }

    Widget extra(AppSideNavExtra e) => item(
          key: e.key,
          icon: e.selected ? e.activeIcon : e.icon,
          label: e.label,
          selected: e.selected,
          count: e.count,
          onTap: e.onTap,
        );

    Widget tab(int i) => item(
          key: ValueKey('side-nav-tab-$i'),
          icon: i == currentIndex ? tabs[i].activeIcon : tabs[i].icon,
          label: tabs[i].label,
          selected: i == currentIndex,
          onTap: () {
            if (i != currentIndex) AppHaptics.selection();
            onTabSelected(i);
          },
        );

    final create = item(
      key: const ValueKey('side-nav-create'),
      icon: AppIcons.addRounded,
      label: createLabel,
      selected: false,
      onTap: onCreatePressed,
    );

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
              children: extras
                  ? [
                      tab(0),
                      tab(1),
                      if (messages != null) extra(messages!),
                      tab(2),
                      if (notifications != null) extra(notifications!),
                      create,
                      tab(3),
                    ]
                  : [
                      for (var i = 0; i < tabs.length; i++) tab(i),
                      const SizedBox(height: AppSpacing.md),
                      create,
                    ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Desktop: the hover tint over a menu item (the tablet menu stays as it
/// was, with no hover layer at all).
Widget _hoverable(Widget item, bool desktop) => desktop
    ? HoverSurface(
        borderRadius: BorderRadius.circular(AppRadii.field),
        child: item,
      )
    : item;
