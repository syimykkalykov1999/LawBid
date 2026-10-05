import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/demo/application/demo_providers.dart';
import 'package:lawbid/features/notifications/application/push_service.dart';

/// Signs out: `POST /auth/logout` (best effort) + local session clear
/// (secure storage too). AppRouterGuard then sends the user to /welcome —
/// callers never navigate. Used by Settings → Log out and by the back
/// button of the first onboarding step ("back to sign-in").
Future<void> signOut(WidgetRef ref) async {
  // Owner 2026-10-05 (docs/ops/demo-world.md): inside a demo account «Выйти»
  // leaves the demo — back to the parked real account, or to the welcome
  // screen for a blogger who came in with a code.
  if (ref.read(sessionControllerProvider)?.isDemo ?? false) {
    await ref.read(demoSessionControllerProvider.notifier).exitDemo();
    return;
  }
  // docs/05 §9.5: this device stops getting pushes for the account.
  await ref.read(pushServiceProvider).unregister();
  try {
    await ref.read(authRepositoryProvider).logout();
  } catch (_) {
    // Server-side logout is best effort — local state is cleared anyway.
  }
  await ref.read(sessionControllerProvider.notifier).clear();
}
