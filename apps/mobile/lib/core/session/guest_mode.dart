import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';

/// Owner 2026-10-22 (checklist §7 / §21, decision A1): browsing without an
/// account, like Instagram's logged-out web. A guest is "no token after the
/// splash" while the flag [kGuestBrowsingFlag] is on; the router guard
/// lets guests see the feed, search and public profiles, every action
/// (follow, like, comment, message, call, bid, post, save, consultation)
/// goes through `requireSignIn` (shared/presentation/guest_gate.dart) and
/// comes back to where the guest was ([GuestReturnController]).
///
/// The guest state lives here, in the session layer, on purpose: there is
/// no guest token and no guest user — only the absence of a session.
const kGuestBrowsingFlag = 'guest_browsing';

/// The admin flag; the compiled-in default is in default_feature_flags.dart.
final guestBrowsingEnabledProvider = Provider<bool>(
  (ref) => ref.watch(featureFlagsControllerProvider).isEnabled(
        kGuestBrowsingFlag,
      ),
);

/// True while the app shows its screens to a person without an account:
/// no token and no `GET /users/me` (a loaded user always came with a
/// session; tests pin a user without one).
final isGuestProvider = Provider<bool>((ref) {
  if (!ref.watch(guestBrowsingEnabledProvider)) return false;
  if (ref.watch(appStartupProvider) != StartupStatus.ready) return false;
  if (!ref.watch(sessionControllerProvider.select((s) => s == null))) {
    return false;
  }
  return ref.watch(currentUserControllerProvider.select((s) => s.user == null));
});

/// Where a guest was when they tapped something that needs an account.
/// The guard sends the freshly signed-in (and onboarded) person there
/// instead of the feed, then the router clears it.
class GuestReturnController extends Notifier<String?> {
  @override
  String? build() => null;

  // ignore: use_setters_to_change_properties
  void set(String? location) => state = location;

  void clear() => state = null;
}

final guestReturnProvider = NotifierProvider<GuestReturnController, String?>(
  GuestReturnController.new,
);

/// Screens a guest may open (the router guard; also the deep-link
/// controller). Everything else needs a session.
bool isGuestRoute(String location) {
  if (location == '/feed' || location == '/search') return true;
  for (final prefix in const [
    '/lawyer/',
    '/u/',
    '/client/',
    '/post/',
    '/c/',
    '/tag/',
    '/legal/',
  ]) {
    if (location.startsWith(prefix)) return true;
  }
  return location == '/qr/scan';
}
