import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
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

/// Owner 2026-10-23: the iOS / Android apps have no guest browsing (as in
/// Instagram, WhatsApp, Telegram) unless the admin sets
/// `client.guest_browse_app_enabled`; the website follows
/// `client.guest_browse_web_enabled` (on until the admin turns it off).
/// A server that does not send the key (an older one) means "off" in the
/// app and "on" on the web: today's behaviour of each.
const kGuestBrowseAppKey = 'client.guest_browse_app_enabled';
const kGuestBrowseWebKey = 'client.guest_browse_web_enabled';

/// Whether this build offers guest browsing, from the bootstrap's
/// `app_config` ([web] picks the website's key; tests pass it).
bool guestBrowseSwitchOn(Map<String, String> appConfig, {required bool web}) {
  final raw = appConfig[web ? kGuestBrowseWebKey : kGuestBrowseAppKey];
  return web ? raw != 'false' : raw == 'true';
}

/// The admin flag (compiled-in default: on) AND, per platform, the server
/// key above. The welcome link, the router guard, the deep links and every
/// guest screen read this one provider.
final guestBrowsingEnabledProvider = Provider<bool>((ref) {
  final flags = ref.watch(featureFlagsControllerProvider);
  return flags.isEnabled(kGuestBrowsingFlag) &&
      guestBrowseSwitchOn(flags.appConfig, web: kIsWeb);
});

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
    '/post/',
    '/c/',
    '/tag/',
    '/legal/',
  ]) {
    if (location.startsWith(prefix)) return true;
  }
  return location == '/qr/scan';
}

/// What a read that needs an account answers for a guest without going to
/// the network: the same 401 the API would send, flagged as a guest's so the
/// screens say «sign in» (see `apiErrorText`, `CasesErrorView`).
ApiException guestSignInRequired() => const ApiException(
      code: ApiErrorCodes.unauthorized,
      message: 'Sign in to see this.',
      statusCode: 401,
      guest: true,
    );
