import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/demo/application/demo_providers.dart';
import 'package:lawbid/features/demo/domain/demo_models.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';

/// Owner 2026-10-05 — the two demo transitions every demo surface shares.
/// Both wait for the new account's `GET /users/me` first (so the guard goes
/// straight to the feed instead of parking on the splash, which would
/// re-run the whole startup sequence) and navigate through the ROOT router
/// (never a possibly-popped sheet context); with no session left (blogger
/// exiting) the guard lands on the welcome screen.

/// Enters [session] (created, re-entered, or redeemed by code) and leaves
/// whatever screen the user is on. Errors are shown with [context] if it
/// is still mounted.
Future<void> enterDemoAndGo(
  BuildContext context,
  WidgetRef ref,
  DemoSession session,
) async {
  try {
    await ref.read(demoSessionControllerProvider.notifier).enterDemo(session);
    await awaitCurrentUser(ref);
    ref.read(appRouterProvider).go(AppRoutes.feed);
  } catch (e) {
    if (context.mounted) {
      showAppSnackBar(context, errorText(ref.read(translatorProvider), e));
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
Future<void> awaitCurrentUser(WidgetRef ref) async {
  try {
    await ref.read(currentUserControllerProvider.notifier).ensureLoaded();
  } catch (_) {}
}

IconData demoRoleIcon(DemoRole role) => switch (role) {
      DemoRole.client => AppIcons.personOutlineRounded,
      DemoRole.attorney => AppIcons.gavelRounded,
      DemoRole.assistant => AppIcons.supportAgentRounded,
    };
