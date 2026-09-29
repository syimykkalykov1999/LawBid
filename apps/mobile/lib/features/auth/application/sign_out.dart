import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../notifications/application/push_service.dart';

import '../../../core/session/session_providers.dart';
import 'auth_providers.dart';

/// Signs out: `POST /auth/logout` (best effort) + local session clear
/// (secure storage too). AppRouterGuard then sends the user to /welcome —
/// callers never navigate. Used by Settings → Log out and by the back
/// button of the first onboarding step ("back to sign-in").
Future<void> signOut(WidgetRef ref) async {
  // docs/05 §9.5: this device stops getting pushes for the account.
  await ref.read(pushServiceProvider).unregister();
  try {
    await ref.read(authRepositoryProvider).logout();
  } catch (_) {
    // Server-side logout is best effort — local state is cleared anyway.
  }
  await ref.read(sessionControllerProvider.notifier).clear();
}
