import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/widgets/bars/app_side_nav.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/shell/bottom_nav_config.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/features/create/presentation/create_sheet.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';

/// Placed by the main shell: a screen pushed inside a tab already sits next
/// to the shell's menu and in its column, so [WebPageFrame] does nothing.
class InsideMainShell extends InheritedWidget {
  const InsideMainShell({required super.child, this.navAway, super.key});

  /// Owner 2026-10-22: how far the bottom bar has slid away (0 = shown,
  /// 1 = gone) — the feed slides it out as its pages move into Chats.
  final ValueNotifier<double>? navAway;

  static bool of(BuildContext context) =>
      context.getInheritedWidgetOfExactType<InsideMainShell>() != null;

  /// The shell's [navAway] (null outside the shell).
  static ValueNotifier<double>? navAwayOf(BuildContext context) =>
      context.getInheritedWidgetOfExactType<InsideMainShell>()?.navAway;

  @override
  bool updateShouldNotify(InsideMainShell oldWidget) => false;
}

/// A column of at most [maxWidth] (all of it when null) at the top centre.
/// The screens inside see the column's width as the screen's width, so they
/// lay out as on a phone.
class ContentColumn extends StatelessWidget {
  const ContentColumn({required this.child, this.maxWidth, super.key});

  final double? maxWidth;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth ?? double.infinity),
        child: LayoutBuilder(
          builder: (context, constraints) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              size: Size(constraints.maxWidth, constraints.maxHeight),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

/// Owner 2026-10-15 (web): a pushed screen (new post, a case, settings, the
/// sign-in steps) sits in the same centred column as the tabs. Inside the
/// app the side menu stays at the edge; sign-in and onboarding get a
/// narrower column and no menu. On a phone-sized window it does nothing.
class WebPageFrame extends ConsumerWidget {
  const WebPageFrame({
    required this.location,
    required this.child,
    this.imperative = false,
    super.key,
  });

  final String location;

  /// A screen pushed with `Navigator.push` (not a go_router page): a tab
  /// tap closes it first, so it does not stay above the new tab.
  final bool imperative;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (InsideMainShell.of(context)) return child;
    final width = MediaQuery.sizeOf(context).width;
    final layout = shellLayoutFor(width, adaptive: adaptiveShellOn);
    if (layout == ShellLayout.bottom) return child;
    // The page under this one must not show through at the sides.
    final bg = Theme.of(context).scaffoldBackgroundColor;
    Widget paint(Widget w) => bg.a == 1 ? ColoredBox(color: bg, child: w) : w;
    if (isAuthLocation(location)) {
      return paint(ContentColumn(maxWidth: kAuthColumnMaxWidth, child: child));
    }
    final extended = layout == ShellLayout.extendedRail;
    final translator = ref.watch(translatorProvider);
    final tabs = tabsForRole(ref.watch(currentUserRoleProvider), translator);
    const paths = [
      AppRoutes.feed,
      AppRoutes.search,
      AppRoutes.mine,
      AppRoutes.profile,
    ];
    return paint(
      Row(
        children: [
          Material(
            type: MaterialType.transparency,
            child: AppSideNav(
              tabs: tabs,
              currentIndex: -1,
              onTabSelected: (i) {
                if (imperative) {
                  Navigator.of(context).popUntil((r) => r.isFirst);
                }
                context.go(paths[i]);
              },
              onCreatePressed: () => showCreateSheet(context, ref),
              extended: extended,
              createLabel: translator.t('nav.create'),
            ),
          ),
          Expanded(
            child: ContentColumn(
              maxWidth: extended ? kShellContentMaxWidth : null,
              child: child,
            ),
          ),
        ],
      ),
    );
  }
}

/// Owner 2026-10-16 (web): a screen opened with `Navigator.push` keeps the
/// side menu and the column like the go_router pages. Phones: [child] as is.
Widget webPageRoute(Widget child) =>
    WebPageFrame(location: '', imperative: true, child: child);
