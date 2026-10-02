import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/widgets/bars/app_bottom_nav.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/shell/bottom_nav_config.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/application/push_service.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';

/// Shell scaffold for the 4 `StatefulShellRoute.indexedStack` branches
/// (Лента/Поиск/Моё/Профиль), hosting [AppBottomNav]. The "+" tab is not a
/// branch — tapping it pushes [AppRoutes.create] on the root navigator (file
/// 07 §3.4) rather than switching the indexed stack.
///
/// `StatefulShellRoute.indexedStack` (not plain `ShellRoute`) preserves each
/// tab's own Navigator/scroll state when switching — see the stage 1.5
/// architecture review in docs/CHANGELOG.md for why this variant was chosen
/// over the ТЗ's literal "ShellRoute" wording.
class MainShell extends ConsumerStatefulWidget {
  const MainShell({required this.navigationShell, super.key});

  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  StatefulNavigationShell get navigationShell => widget.navigationShell;

  @override
  void initState() {
    super.initState();
    // Owner 2026-09-30 (reverses the 2026-09-29 decision): the system
    // status bar (clock, network, battery) stays visible in-app too.
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  }

  @override
  Widget build(BuildContext context) {
    final role = ref.watch(currentUserRoleProvider);
    final translator = ref.watch(translatorProvider);
    final tabs = tabsForRole(role, translator);
    // docs/05 §8.5 / §9.5 / §10: while the signed-in app is on screen keep
    // the realtime socket, the offline outbox, the badges and push alive.
    // listen (not watch): a badge tick must not rebuild the shell.
    ref
      ..listen(realtimeClientProvider, (_, __) {})
      ..listen(badgesProvider, (_, __) {})
      ..listen(sessionServicesProvider, (_, __) {});

    return Scaffold(
      body:
          _TabFade(index: navigationShell.currentIndex, child: navigationShell),
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

/// Fades the tab body in whenever the selected branch changes (UI
/// modernization pass, 2026-09-27). The SAME [child] instance is kept
/// mounted (no key change), so `StatefulShellRoute.indexedStack` still
/// preserves every branch's navigator/scroll state. No-op under
/// reduce-motion.
class _TabFade extends StatefulWidget {
  const _TabFade({required this.index, required this.child});

  final int index;
  final Widget child;

  @override
  State<_TabFade> createState() => _TabFadeState();
}

class _TabFadeState extends State<_TabFade>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: AppMotion.stateChange,
    value: 1,
  );

  @override
  void didUpdateWidget(covariant _TabFade oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.index != widget.index && !context.reduceMotion) {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity:
          CurvedAnimation(parent: _controller, curve: AppMotion.enterCurve),
      child: widget.child,
    );
  }
}
