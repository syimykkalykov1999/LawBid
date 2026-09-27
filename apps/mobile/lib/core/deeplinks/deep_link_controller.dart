import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/application/onboarding_flow.dart';
import '../../features/auth/auth_routes.dart';
import '../../features/auth/domain/onboarding_step.dart';
import '../../features/onboarding/application/current_user_controller.dart';
import '../config/app_environment.dart';
import '../navigation/app_router.dart';
import '../navigation/guards/app_router_guard.dart';
import '../session/session_providers.dart';
import '../startup/app_startup.dart';
import 'deep_link.dart';

/// Where incoming link URIs come from. Production: `app_links` (custom
/// scheme + universal links + App Links, cold start and while running).
abstract interface class DeepLinkSource {
  /// The link that launched the app, if any.
  Future<Uri?> initialLink();

  /// Links received while the app is running.
  Stream<Uri> get links;
}

class AppLinksDeepLinkSource implements DeepLinkSource {
  AppLinksDeepLinkSource([AppLinks? appLinks]) : _appLinks = appLinks ?? AppLinks();

  final AppLinks _appLinks;

  @override
  Future<Uri?> initialLink() => _appLinks.getInitialLink();

  @override
  Stream<Uri> get links => _appLinks.uriLinkStream;
}

final deepLinkSourceProvider = Provider<DeepLinkSource>((ref) => AppLinksDeepLinkSource());

/// Navigation used by [DeepLinkController] — the app router's `go`;
/// overridable in tests.
final deepLinkNavigatorProvider = Provider<void Function(String location)>(
  (ref) =>
      (location) => ref.read(appRouterProvider).go(location),
);

/// Turns incoming links into app actions (docs/01_FOUNDATION_AUTH.md §12,
/// §10.2 E/F). State = the link still waiting to be handled (null = none).
///
/// - Nothing happens before the splash sequence finishes (startup
///   `ready`) — the guard owns the screen until then. A cold-start link is
///   held and handled right after.
/// - [EmailCodeDeepLink] (magic sign-in link): signed out → redeem it via
///   `OnboardingFlow.verifyEmailMagicLink` (email code screen while it
///   verifies; the email screen when this device holds no verifier);
///   already signed in → dropped (the link is for signing in, the user
///   already is).
/// - [ContentDeepLink]: opened once the user is signed in AND fully
///   onboarded; until then it waits (sign-in and onboarding run first, the
///   guard would bounce the route anyway), then opens by itself.
class DeepLinkController extends Notifier<DeepLink?> {
  StreamSubscription<Uri>? _subscription;

  @override
  DeepLink? build() {
    ref
      ..listen(appStartupProvider, (_, __) => _drain())
      ..listen(sessionControllerProvider.select((s) => s?.sub), (_, __) => _drain())
      ..listen(currentUserControllerProvider, (_, __) => _drain())
      ..onDispose(() => _subscription?.cancel());
    return null;
  }

  /// Subscribes to [DeepLinkSource]; call once at app start.
  Future<void> start() async {
    if (_subscription != null) return;
    final source = ref.read(deepLinkSourceProvider);
    _subscription = source.links.listen(handleUri, onError: (Object _) {});
    try {
      final initial = await source.initialLink();
      if (initial != null) handleUri(initial);
    } catch (_) {
      // A malformed launch URI must never break startup.
    }
  }

  /// Parses [uri]; unknown/invalid links are ignored.
  void handleUri(Uri uri) {
    final link = parseDeepLink(uri, host: ref.read(appEnvironmentProvider).deepLinkHost);
    if (link == null) return;
    state = link;
    _drain();
  }

  void _drain() {
    final link = state;
    if (link == null) return;
    if (ref.read(appStartupProvider) != StartupStatus.ready) return;
    final hasSession = ref.read(sessionControllerProvider) != null;

    switch (link) {
      case EmailCodeDeepLink(:final token):
        state = null;
        if (hasSession) return;
        final navigate = ref.read(deepLinkNavigatorProvider);
        unawaited(
          ref.read(onboardingFlowProvider.notifier).verifyEmailMagicLink(
            token,
            show: (step) =>
                navigate(step == OnboardingStep.email ? AuthRoutes.email : AuthRoutes.otp),
          ),
        );
      case ContentDeepLink(:final location):
        if (!hasSession) return; // wait for sign-in
        final user = ref.read(currentUserControllerProvider).user;
        if (user == null || AppRouterGuard.requiredStep(user) != null) {
          return; // wait for GET /users/me + onboarding
        }
        state = null;
        ref.read(deepLinkNavigatorProvider)(location);
    }
  }
}

final deepLinkControllerProvider = NotifierProvider<DeepLinkController, DeepLink?>(
  DeepLinkController.new,
);
