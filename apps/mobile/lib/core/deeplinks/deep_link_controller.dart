import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';
import 'package:lawbid/core/deeplinks/group_invite_handler.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/guards/app_router_guard.dart';
import 'package:lawbid/core/platform/spotlight_index.dart';
import 'package:lawbid/core/session/guest_mode.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/auth/application/onboarding_flow.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/auth/domain/onboarding_step.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';

/// Where incoming link URIs come from. Production: `app_links` (custom
/// scheme + universal links + App Links, cold start and while running).
abstract interface class DeepLinkSource {
  /// The link that launched the app, if any.
  Future<Uri?> initialLink();

  /// Links received while the app is running.
  Stream<Uri> get links;
}

class AppLinksDeepLinkSource implements DeepLinkSource {
  AppLinksDeepLinkSource([AppLinks? appLinks])
      : _appLinks = appLinks ?? AppLinks();

  final AppLinks _appLinks;

  @override
  Future<Uri?> initialLink() => _appLinks.getInitialLink();

  @override
  Stream<Uri> get links => _appLinks.uriLinkStream;
}

/// Owner 2026-10-27 (app indexing): a tap on an iPhone Spotlight result
/// (CoreSpotlight item whose identifier is the link) arrives from the native
/// `SpotlightBridge` as that link — then it is handled like any Universal
/// Link. Only built on iOS.
class SpotlightDeepLinkSource implements DeepLinkSource {
  SpotlightDeepLinkSource([
    this._channel = const MethodChannel(spotlightChannelName),
  ]);

  final MethodChannel _channel;
  final StreamController<Uri> _controller = StreamController<Uri>.broadcast();
  bool _listening = false;

  void _listen() {
    if (_listening) return;
    _listening = true;
    _channel.setMethodCallHandler((call) async {
      final raw = call.arguments;
      if (call.method != 'open' || raw is! String) return;
      final uri = Uri.tryParse(raw);
      if (uri != null) _controller.add(uri);
    });
  }

  @override
  Future<Uri?> initialLink() async {
    _listen();
    try {
      final raw = await _channel.invokeMethod<String>('initialLink');
      return raw == null ? null : Uri.tryParse(raw);
    } on Object {
      return null; // an old native build without the bridge
    }
  }

  @override
  Stream<Uri> get links {
    _listen();
    return _controller.stream;
  }
}

/// Several sources as one: the first launch link wins, all live links flow.
class MergedDeepLinkSource implements DeepLinkSource {
  const MergedDeepLinkSource(this.sources);

  final List<DeepLinkSource> sources;

  @override
  Future<Uri?> initialLink() async {
    Uri? first;
    for (final source in sources) {
      try {
        // Every source is asked (the native bridge hands out its pending
        // link once); the first answer wins.
        final uri = await source.initialLink();
        first ??= uri;
      } on Object {
        // One broken source must not hide the others.
      }
    }
    return first;
  }

  @override
  Stream<Uri> get links {
    final controller = StreamController<Uri>();
    final subs = <StreamSubscription<Uri>>[];
    controller
      ..onListen = () {
        for (final source in sources) {
          subs.add(
            source.links.listen(controller.add, onError: controller.addError),
          );
        }
      }
      ..onCancel = () => Future.wait(subs.map((s) => s.cancel()));
    return controller.stream;
  }
}

final deepLinkSourceProvider = Provider<DeepLinkSource>(
  (ref) => spotlightSupported
      ? MergedDeepLinkSource([
          AppLinksDeepLinkSource(),
          SpotlightDeepLinkSource(),
        ])
      : AppLinksDeepLinkSource(),
);

/// Navigation used by [DeepLinkController] — the app router's `go`;
/// overridable in tests.
final deepLinkNavigatorProvider = Provider<void Function(String location)>(
  (ref) => (location) => ref.read(appRouterProvider).go(location),
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
      ..listen(
        sessionControllerProvider.select((s) => s?.sub),
        (_, __) => _drain(),
      )
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
      // Web: the address the tab was opened on is the link.
      final initial = kIsWeb ? Uri.base : await source.initialLink();
      if (initial != null) handleUri(initial);
    } catch (_) {
      // A malformed launch URI must never break startup.
    }
  }

  /// Parses [uri]; unknown/invalid links are ignored.
  void handleUri(Uri uri) {
    final link = parseDeepLink(
      uri,
      // Web: the page's own host is the app's link host.
      host: kIsWeb ? uri.host : ref.read(appEnvironmentProvider).deepLinkHost,
      webTabs: kIsWeb,
    );
    if (link == null) return;
    state = link;
    _drain();
  }

  void _drain() {
    final link = state;
    if (link == null) return;
    if (ref.read(appStartupProvider) != StartupStatus.ready) return;
    final hasSession = ref.read(sessionControllerProvider) != null;
    // Owner 2026-10-22 (guest browsing): a public screen opens for a guest
    // too — a profile, a post, a channel (and the web's tab addresses).
    final guest = !hasSession && ref.read(guestBrowsingEnabledProvider);

    switch (link) {
      case EmailCodeDeepLink(:final token):
        state = null;
        if (hasSession) return;
        final navigate = ref.read(deepLinkNavigatorProvider);
        unawaited(
          ref.read(onboardingFlowProvider.notifier).verifyEmailMagicLink(
                token,
                show: (step) => navigate(
                  step == OnboardingStep.email
                      ? AuthRoutes.email
                      : AuthRoutes.otp,
                ),
              ),
        );
      case ReferralDeepLink(:final code):
        if (!hasSession) return;
        final user = ref.read(currentUserControllerProvider).user;
        if (user == null || AppRouterGuard.requiredStep(user) != null) return;
        state = null;
        ref.read(deepLinkNavigatorProvider)(
          '${AppRoutes.referral}?code=${Uri.encodeQueryComponent(code)}',
        );
      case WebLoginDeepLink(:final qrId):
        // Owner 2026-10-20: the website's sign-in QR. A phone with a
        // signed-in user gets the "Sign in on the web?" question (the QR
        // lives two minutes, so a signed-out phone drops it instead of
        // waiting); a browser gets the public "open the app" page.
        state = null;
        if (!kIsWeb && !hasSession) return;
        ref.read(deepLinkNavigatorProvider)(AppRoutes.webLogin(qrId));
      case GroupInviteDeepLink(:final token):
        if (!hasSession) return;
        final user = ref.read(currentUserControllerProvider).user;
        if (user == null || AppRouterGuard.requiredStep(user) != null) return;
        state = null;
        ref.read(groupInviteHandlerProvider)?.call(token);
      case ProfileDeepLink(:final location) ||
            ContentDeepLink(:final location) ||
            TabDeepLink(:final location):
        if (guest && isGuestRoute(location)) {
          state = null;
          ref.read(deepLinkNavigatorProvider)(location);
          return;
        }
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

final deepLinkControllerProvider =
    NotifierProvider<DeepLinkController, DeepLink?>(
  DeepLinkController.new,
);
