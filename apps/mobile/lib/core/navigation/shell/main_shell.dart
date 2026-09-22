import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../shared/domain/current_role_provider.dart';
import '../../design_system/widgets/bars/app_bottom_nav.dart';
import '../../l10n/l10n_providers.dart';
import '../app_routes.dart';
import 'bottom_nav_config.dart';

/// Shell scaffold for the 4 `StatefulShellRoute.indexedStack` branches
/// (Лента/Поиск/Моё/Профиль), hosting [AppBottomNav]. The "+" tab is not a
/// branch — tapping it pushes [AppRoutes.create] on the root navigator (file
/// 07 §3.4) rather than switching the indexed stack.
///
/// `StatefulShellRoute.indexedStack` (not plain `ShellRoute`) preserves each
/// tab's own Navigator/scroll state when switching — see the stage 1.5
/// architecture review in docs/CHANGELOG.md for why this variant was chosen
/// over the ТЗ's literal "ShellRoute" wording.
class MainShell extends ConsumerWidget {
  const MainShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(currentUserRoleProvider);
    final translator = ref.watch(translatorProvider);
    final tabs = tabsForRole(role, translator);

    return Scaffold(
      body: navigationShell,
      bottomNavigationBar: AppBottomNav(
        tabs: tabs,
        currentIndex: navigationShell.currentIndex,
        onTabSelected: (index) => navigationShell.goBranch(
          index,
          initialLocation: index == navigationShell.currentIndex,
        ),
        onCreatePressed: () => context.push(AppRoutes.create),
        createSemanticLabel: translator.t('nav.create'),
      ),
    );
  }
}
