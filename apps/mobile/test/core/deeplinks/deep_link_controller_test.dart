import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';
import 'package:lawbid/core/deeplinks/deep_link_controller.dart';
import 'package:lawbid/core/deeplinks/deep_link_placeholder_screen.dart';
import 'package:lawbid/core/deeplinks/deep_link_routes.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/core/startup/app_startup.dart';
import 'package:lawbid/features/auth/application/onboarding_flow.dart';
import 'package:lawbid/features/auth/auth_routes.dart';
import 'package:lawbid/features/auth/domain/onboarding_flow_state.dart';
import 'package:lawbid/features/auth/domain/onboarding_step.dart';
import 'package:lawbid/features/auth/presentation/screens/email_screen.dart';
import 'package:lawbid/features/auth/presentation/screens/otp_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../features/auth/auth_test_harness.dart';
import '../../helpers/fixtures.dart';

class MutableStartup extends AppStartupController {
  MutableStartup(this._initial);
  final StartupStatus _initial;

  @override
  StartupStatus build() => _initial;

  void set(StartupStatus s) => state = s;
}

class FakeSession extends SessionController {
  FakeSession({this.signedIn = false});
  final bool signedIn;

  static final _session = SessionState(
    accessToken: 'at',
    sub: 'user-1',
    role: 'client',
    sid: 's1',
    verified: false,
    subscriptionStatus: 'none',
    accessTokenExpiresAt: DateTime.utc(2030),
  );

  @override
  SessionState? build() => signedIn ? _session : null;

  void signIn() => state = _session;
}

class MutableUser extends CurrentUserController {
  @override
  CurrentUserState build() => const CurrentUserState.idle();

  void set(CurrentUserState s) => state = s;

  /// No backend in these tests: "reload" keeps whatever [set] put there.
  @override
  Future<CurrentUser?> load() async => state.user;
}

class FakeLinkSource implements DeepLinkSource {
  FakeLinkSource({this.initial});
  final Uri? initial;
  final controller = StreamController<Uri>.broadcast();

  @override
  Future<Uri?> initialLink() async => initial;

  @override
  Stream<Uri> get links => controller.stream;
}

const _token = 'Tk_-0123456789abcdefghijABCDEFGHIJ012345678';
const _verifier = 'Vf_-0123456789abcdefghijABCDEFGHIJ012345678';

void main() {
  late RecordingAuthRepository repo;
  late List<String> navigations;
  late FakeLinkSource source;

  setUp(() {
    repo = RecordingAuthRepository();
    navigations = [];
    source = FakeLinkSource();
  });

  Future<ProviderContainer> container({
    StartupStatus startup = StartupStatus.ready,
    bool signedIn = false,
    void Function(String)? navigate,
    String? magicLinkVerifier = _verifier,
  }) async {
    final c = ProviderContainer(
      overrides: [
        ...await authOverrides(
          repo: repo,
          fixedSignedOutUser: false,
          magicLinkVerifier: magicLinkVerifier,
        ),
        appStartupProvider.overrideWith(() => MutableStartup(startup)),
        sessionControllerProvider.overrideWith(() => FakeSession(signedIn: signedIn)),
        currentUserControllerProvider.overrideWith(MutableUser.new),
        deepLinkSourceProvider.overrideWithValue(source),
        deepLinkNavigatorProvider.overrideWithValue(navigate ?? navigations.add),
      ],
    );
    addTearDown(() async {
      await source.controller.close();
      c.dispose();
    });
    return c;
  }

  const magic = 'lawbid://auth/email-code?token=$_token';

  testWidgets('magic link + stored verifier → email code screen, verify-link with both', (tester) async {
    final c = await container();
    await c.read(deepLinkControllerProvider.notifier).start();
    source.controller.add(Uri.parse(magic));
    await tester.pump();
    await tester.pump();

    expect(navigations, [AuthRoutes.otp]);
    expect(repo.verifiedLinks.single, (token: _token, verifier: _verifier));
    expect(repo.verified, isEmpty);
    final flow = c.read(onboardingFlowProvider);
    expect(flow.channel, AuthChannel.email);
    expect(flow.step, OnboardingStep.role); // signed in as a new user
    expect(c.read(deepLinkControllerProvider), isNull);
    await tester.pump(const Duration(milliseconds: 10));
  });

  testWidgets('magic link without a verifier (other device) → email screen, no request', (tester) async {
    final c = await container(magicLinkVerifier: null);
    c.read(deepLinkControllerProvider.notifier).handleUri(Uri.parse(magic));
    await tester.pump();
    await tester.pump();

    expect(navigations, [AuthRoutes.email]);
    expect(repo.verifiedLinks, isEmpty);
    expect(repo.verified, isEmpty);
    final flow = c.read(onboardingFlowProvider);
    expect(flow.step, OnboardingStep.email);
    expect(
      flow.errorMessage,
      'Open the link on the phone where you requested the code, or enter the code from the email.',
    );
    await tester.pump(const Duration(milliseconds: 10));
  });

  testWidgets('cold-start link waits for the splash sequence, then runs', (tester) async {
    source = FakeLinkSource(initial: Uri.parse('https://lawbid.app/auth/email-code?token=$_token'));
    final c = await container(startup: StartupStatus.running);
    await c.read(deepLinkControllerProvider.notifier).start();
    await tester.pump();

    expect(navigations, isEmpty);
    expect(repo.verifiedLinks, isEmpty);
    expect(c.read(deepLinkControllerProvider), isA<EmailCodeDeepLink>());

    (c.read(appStartupProvider.notifier) as MutableStartup).set(StartupStatus.ready);
    await tester.pump();
    await tester.pump();

    expect(navigations, [AuthRoutes.otp]);
    expect(repo.verifiedLinks.single.token, _token);
    await tester.pump(const Duration(milliseconds: 10));
  });

  testWidgets('magic link is ignored while already signed in', (tester) async {
    final c = await container(signedIn: true);
    c.read(deepLinkControllerProvider.notifier).handleUri(Uri.parse(magic));
    await tester.pump();
    expect(navigations, isEmpty);
    expect(repo.verifiedLinks, isEmpty);
    expect(c.read(deepLinkControllerProvider), isNull);
  });

  testWidgets('unknown / foreign links are ignored', (tester) async {
    final c = await container();
    final ctl = c.read(deepLinkControllerProvider.notifier)
      ..handleUri(Uri.parse('https://evil.example/case/1'))
      ..handleUri(Uri.parse('lawbid://auth/email-code?email=a@b.co&code=123456'))
      ..handleUri(Uri.parse('lawbid://auth/email-code?token=short'));
    await tester.pump();
    expect(ctl.state, isNull);
    expect(navigations, isEmpty);
  });

  testWidgets('content link waits for sign-in + onboarding, then opens', (tester) async {
    final c = await container();
    c.read(deepLinkControllerProvider.notifier).handleUri(Uri.parse('https://lawbid.app/case/abc-123'));
    await tester.pump();
    expect(navigations, isEmpty); // signed out: kept

    (c.read(sessionControllerProvider.notifier) as FakeSession).signIn();
    await tester.pump();
    expect(navigations, isEmpty); // /users/me not loaded yet

    final users = c.read(currentUserControllerProvider.notifier) as MutableUser
      ..set(CurrentUserState.ready(meFixture(role: UserRole.client, step: OnboardingStepId.contacts)));
    await tester.pump();
    expect(navigations, isEmpty); // onboarding not finished

    users.set(
      CurrentUserState.ready(
        meFixture(
          role: UserRole.client,
          consents: true,
          firstName: 'Ann',
          lastName: 'Lee',
          phone: '+12025550123',
          phoneVerified: true,
          email: 'ann@example.com',
          emailVerified: true,
          completed: true,
        ),
      ),
    );
    await tester.pump();
    expect(navigations, ['/case/abc-123']);
    expect(c.read(deepLinkControllerProvider), isNull);
  });

  testWidgets('end to end: magic link lands on the email code screen and signs in', (
    tester,
  ) async {
    late GoRouter router;
    final c = await container(navigate: (loc) => router.go(loc));
    router = GoRouter(
      initialLocation: AuthRoutes.welcome,
      routes: [...authRoutes(), ...deepLinkRoutes()],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(routedApp(c, router));
    await c.read(deepLinkControllerProvider.notifier).start();

    source.controller.add(Uri.parse(magic));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.byType(OtpScreen), findsOneWidget);
    expect(find.text('Change email'), findsOneWidget);
    expect(repo.verifiedLinks.single, (token: _token, verifier: _verifier));
    expect(c.read(onboardingFlowProvider).step, OnboardingStep.role); // new user signed in
  });

  testWidgets('end to end: link on another device opens the email screen with the hint', (
    tester,
  ) async {
    late GoRouter router;
    final c = await container(navigate: (loc) => router.go(loc), magicLinkVerifier: null);
    router = GoRouter(
      initialLocation: AuthRoutes.welcome,
      routes: [...authRoutes(), ...deepLinkRoutes()],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(routedApp(c, router));
    await c.read(deepLinkControllerProvider.notifier).start();

    source.controller.add(Uri.parse(magic));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 600));

    expect(find.byType(EmailScreen), findsOneWidget);
    expect(
      find.text('Open the link on the phone where you requested the code, or enter the code from the email.'),
      findsOneWidget,
    );
    expect(repo.verifiedLinks, isEmpty);
  });

  // `/lawyer/:username` now opens the real attorney profile (docs/03 stage
  // 3.9) — covered in test/features/profile/profile_screens_test.dart.
  testWidgets('content routes show the "coming soon" placeholder and can leave', (tester) async {
    final c = await container();
    final router = GoRouter(
      initialLocation: '/feed',
      routes: [
        GoRoute(path: '/feed', builder: (_, __) => const Scaffold(body: Text('FEED'))),
        ...deepLinkRoutes(),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(routedApp(c, router));
    for (final loc in ['/case/abc', '/post/p1']) {
      router.go(loc);
      await tester.pumpAndSettle();
      expect(find.byType(DeepLinkPlaceholderScreen), findsOneWidget);
      expect(find.text('Coming soon'), findsOneWidget);
      await tester.tap(find.text('Back').last);
      await tester.pumpAndSettle();
      expect(find.text('FEED'), findsOneWidget);
    }
  });
}
