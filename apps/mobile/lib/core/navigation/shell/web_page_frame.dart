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
  const WebPageFrame({required this.location, required this.child, super.key});

  final String location;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final width = MediaQuery.sizeOf(context).width;
    final layout = shellLayoutFor(width,
        adaptive: adaptiveShellOverride ?? kAdaptiveShell);
    if (layout == ShellLayout.bottom) return child;
    if (isAuthLocation(location)) {
      return ContentColumn(maxWidth: kAuthColumnMaxWidth, child: child);
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
    return Row(
      children: [
        Material(
          type: MaterialType.transparency,
          child: AppSideNav(
            tabs: tabs,
            currentIndex: -1,
            onTabSelected: (i) => context.go(paths[i]),
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
    );
  }
}
