import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/legal/application/legal_providers.dart';
import 'package:lawbid/features/legal/data/legal_repository.dart';
import 'package:lawbid/features/legal/domain/legal_models.dart';
import 'package:lawbid/features/legal/presentation/dmca_notice_screen.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/onboarding_harness.dart';

/// Owner 2026-10-05 (legal): the DMCA form sends nothing until every
/// required field and both sworn statements are in.
class FakeLegalRepository extends LegalRepository {
  FakeLegalRepository() : super(Dio());

  final List<DmcaNoticeDraft> sent = [];

  @override
  Future<LegalSettings> settings() async => throw StateError('unused');

  @override
  Future<String> createDmcaNotice(DmcaNoticeDraft draft) async {
    sent.add(draft);
    return 'notice-1';
  }
}

final _client = meFixture(
  role: UserRole.client,
  consents: true,
  firstName: 'Ann',
  lastName: 'Lee',
  email: 'ann@example.com',
  emailVerified: true,
  completed: true,
);

const _withAgent = LegalSettings(
  dmcaAgent: DmcaAgent(
    name: 'Jane Agent',
    email: 'dmca@lawbid.dev',
    address: '1 Main St, Austin, TX',
  ),
  texts: LegalTexts(
    caseCreate: '',
    attorneyUnverified: '',
    supportNote: '',
    partnerDisclosure: '',
    partnerTerms: '',
  ),
  partnerTermsVersion: '2026-10-05',
);

Future<FakeLegalRepository> _pump(
  WidgetTester tester, {
  String? targetType,
  String? targetId,
  LegalSettings? settings,
}) async {
  // A tall phone so the lazy ListView builds the whole form.
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(600, 2400);
  addTearDown(tester.view.reset);
  final repo = FakeLegalRepository();
  final wrap = await onboardingWrapper(
    AppTheme.light(),
    user: _client,
    repo: FakeOnboardingRepository(_client),
    legal: settings,
    extra: [legalRepositoryProvider.overrideWithValue(repo)],
  );
  await tester.pumpWidget(
    wrap(DmcaNoticeScreen(targetType: targetType, targetId: targetId)),
  );
  await tester.pumpAndSettle();
  return repo;
}

Future<void> _type(WidgetTester tester, String key, String text) async {
  final finder = find.byKey(ValueKey(key));
  await tester.ensureVisible(finder);
  await tester.enterText(finder, text);
  await tester.pump();
}

Future<void> _tap(WidgetTester tester, String key) async {
  // Let an earlier snackbar leave so it does not cover the bottom button.
  await tester.pump(const Duration(seconds: 6));
  await tester.pumpAndSettle();
  final finder = find.byKey(ValueKey(key));
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('empty form: nothing is sent, required errors appear',
      (tester) async {
    final repo = await _pump(tester);
    // No agent registered yet → the placeholder; the URL field is shown
    // because no LawBid target was given.
    expect(
      find.text('The copyright agent address will appear here'),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('dmca-url')), findsOneWidget);

    await _tap(tester, 'dmca-submit');
    expect(repo.sent, isEmpty);
    expect(find.text('Required'), findsWidgets);
    expect(find.text('Tick both statements.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
      'bad email, short description or an unticked statement block the send',
      (tester) async {
    final repo = await _pump(tester, targetType: 'post', targetId: 'post-1');
    expect(find.byKey(const ValueKey('dmca-url')), findsNothing);
    expect(find.byKey(const ValueKey('dmca-target')), findsOneWidget);

    await _type(tester, 'dmca-name', 'Ann Lee');
    await _type(tester, 'dmca-email', 'not-an-email');
    await _type(tester, 'dmca-address', '1 Main St, Austin, TX 78701');
    await _type(tester, 'dmca-work', 'too short');
    await _type(tester, 'dmca-signature', 'Ann Lee');
    await _tap(tester, 'dmca-good-faith');

    await _tap(tester, 'dmca-submit');
    expect(repo.sent, isEmpty);
    expect(find.text('Enter a valid email'), findsOneWidget);
    expect(find.text('At least 20 characters'), findsOneWidget);
    expect(find.text('Tick both statements.'), findsOneWidget);

    await _type(tester, 'dmca-email', 'ann@example.com');
    await _type(
      tester,
      'dmca-work',
      'My photo "Sunset over Austin" was copied into this post.',
    );
    await _tap(tester, 'dmca-accuracy');
    await _tap(tester, 'dmca-submit');

    expect(repo.sent, hasLength(1));
    final d = repo.sent.single;
    expect(d.target, DmcaTarget.post);
    expect(d.targetId, 'post-1');
    expect(d.infringingUrl, isNull);
    expect(d.complainantEmail, 'ann@example.com');
    expect(d.goodFaith, isTrue);
    expect(d.accuracySworn, isTrue);
    expect(d.signature, 'Ann Lee');
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets(
      'URL form: the link must be http(s); the agent card shows the agent',
      (tester) async {
    final repo = await _pump(tester, settings: _withAgent);
    expect(find.textContaining('Jane Agent'), findsOneWidget);
    expect(find.textContaining('dmca@lawbid.dev'), findsOneWidget);

    await _type(tester, 'dmca-name', 'Ann Lee');
    await _type(tester, 'dmca-email', 'ann@example.com');
    await _type(tester, 'dmca-address', '1 Main St, Austin, TX 78701');
    await _type(tester, 'dmca-url', 'lawbid.dev/post/1');
    await _type(
      tester,
      'dmca-work',
      'My article was copied word for word into this page.',
    );
    await _type(tester, 'dmca-signature', 'Ann Lee');
    await _tap(tester, 'dmca-good-faith');
    await _tap(tester, 'dmca-accuracy');
    await _tap(tester, 'dmca-submit');
    expect(repo.sent, isEmpty);
    expect(
      find.text('Enter a link starting with http:// or https://'),
      findsOneWidget,
    );

    await _type(tester, 'dmca-url', 'https://lawbid.dev/post/1');
    await _tap(tester, 'dmca-submit');
    expect(repo.sent, hasLength(1));
    expect(repo.sent.single.target, isNull);
    expect(repo.sent.single.infringingUrl, 'https://lawbid.dev/post/1');
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
