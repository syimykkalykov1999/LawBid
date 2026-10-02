import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/app_update/app_update_gate.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/connectivity/offline_banner_host.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/root_messenger.dart';
import 'package:lawbid/core/theme/preferences_sync.dart';
import 'package:lawbid/features/calls/presentation/call_host.dart';

class LawBidApp extends ConsumerWidget {
  const LawBidApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Mirrors theme/language to PATCH /users/me while signed in and applies
    // the account's values after login (core/theme/preferences_sync.dart).
    ref.listen(preferencesSyncProvider, (_, __) {});
    final router = ref.watch(appRouterProvider);
    final themeMode =
        ref.watch(themeModeControllerProvider).value ?? ThemeMode.system;

    return MaterialApp.router(
      scaffoldMessengerKey: rootMessengerKey,
      // "LawBid Dev" / "LawBid Staging" / "LawBid" (task switcher).
      title: ref.watch(appEnvironmentProvider).appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      routerConfig: router,
      // Update gate (docs/01_FOUNDATION_AUTH.md §7/§12/§15 "Этап 1.8"):
      // forced-update screen (below min_app_version_* or ANY 426
      // APP_UPDATE_REQUIRED response) and the dismissible soft-update
      // prompt — see core/app_update/app_update_gate.dart. Inside it, the
      // global offline banner (docs/01 §8.3, p12 leaf-1.6), active only on
      // in-app routes — see core/connectivity/offline_banner_host.dart.
      // Owner 2026-09-30: a tap on empty space anywhere hides the keyboard
      // (Instagram/YouTube behaviour). Translucent: buttons and fields
      // still get their own taps first.
      builder: (context, child) => GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
        child: AppUpdateGate(
          child: child == null
              ? null
              // OQ-041: the call screen pops over any route.
              : CallHost(
                  router: router,
                  child: RouterOfflineBannerHost(router: router, child: child),
                ),
        ),
      ),
    );
  }
}
