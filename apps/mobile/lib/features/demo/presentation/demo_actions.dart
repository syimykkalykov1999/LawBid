import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/demo/application/demo_providers.dart';
import 'package:lawbid/features/demo/domain/demo_models.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:material_ui/material_ui.dart';

/// Owner 2026-10-05 — the two demo transitions every demo surface shares.
/// Both wait for the new account's `GET /users/me` first (so the guard goes
/// straight to the feed instead of parking on the splash, which would
/// re-run the whole startup sequence) and navigate through the ROOT router
/// (never a possibly-popped sheet context); with no session left (blogger
/// exiting) the guard lands on the welcome screen.

/// Enters [session] (created, re-entered, or redeemed by code) and leaves
/// whatever screen the user is on. Errors are shown with [context] if it
/// is still mounted, else on the root navigator.
///
/// Round 1 check 25.11 №29 (as №1, `toggleBlock`): the demo sheets close
/// themselves and then call this with their own context. Their `WidgetRef`
/// is disposed with the sheet (Riverpod 3: «Cannot use ref after the widget
/// was disposed»), so a sign-in longer than the 250 ms slide-out lost the
/// move to the feed silently. The providers are read through the app's
/// [ProviderContainer], taken from [context] while it is still mounted.
Future<void> enterDemoAndGo(BuildContext context, DemoSession session) async {
  final container = ProviderScope.containerOf(context, listen: false);
  final router = container.read(appRouterProvider);
  try {
    await container
        .read(demoSessionControllerProvider.notifier)
        .enterDemo(session);
    await _ensureCurrentUser(
      container.read(currentUserControllerProvider.notifier),
    );
    router.go(AppRoutes.feed);
  } catch (e) {
    final shown = context.mounted
        ? context
        : router.routerDelegate.navigatorKey.currentContext;
    if (shown != null && shown.mounted) {
      showAppSnackBar(shown, errorText(container.read(translatorProvider), e));
    }
  }
}

/// Leaves the demo: back to the real account, or to the welcome screen for
/// a blogger who came in with a code. Says which one happened.
Future<void> exitDemoAndGo(BuildContext context, WidgetRef ref) async {
  final t = ref.read(translatorProvider);
  final restored =
      await ref.read(demoSessionControllerProvider.notifier).exitDemo();
  if (restored) await awaitCurrentUser(ref);
  ref.read(appRouterProvider).go(AppRoutes.feed);
  if (context.mounted) {
    showAppSnackBar(
      context,
      t.t(restored ? 'demo.exited' : 'demo.exited.signedOut'),
    );
  }
}

/// Waits for `GET /users/me` of the session now in memory (best effort —
/// a failure leaves the guard to show the splash with Retry).
Future<void> awaitCurrentUser(WidgetRef ref) =>
    _ensureCurrentUser(ref.read(currentUserControllerProvider.notifier));

Future<void> _ensureCurrentUser(CurrentUserController user) async {
  try {
    await user.ensureLoaded();
  } catch (_) {}
}

IconData demoRoleIcon(DemoRole role) => switch (role) {
      DemoRole.client => AppIcons.personOutlineRounded,
      DemoRole.attorney => AppIcons.gavelRounded,
      DemoRole.assistant => AppIcons.supportAgentRounded,
    };
