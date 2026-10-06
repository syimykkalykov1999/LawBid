import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/legal/application/legal_providers.dart';
import 'package:lawbid/features/legal/data/legal_repository.dart';
import 'package:lawbid/features/legal/domain/legal_documents.dart';
import 'package:lawbid/features/legal/presentation/legal_accept_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/fixtures.dart';
import '../../helpers/long_locale.dart';
import '../../helpers/onboarding_harness.dart';
import '../../helpers/ux_harness.dart';

/// Owner 2026-10-05 (legal documents): the screen where the user accepts
/// the new / changed documents of their role. Nothing is pre-ticked, the
/// button stays inert until every document is ticked, and the acceptance
/// goes to the server with exactly the ids shown.
class _FakeLegalRepository extends LegalRepository {
  _FakeLegalRepository() : super(Dio());

  final List<List<String>> accepted = [];
  Object? failWith;

  @override
  Future<List<PendingLegalDocument>> accept(List<String> documentIds) async {
    if (failWith != null) {
      // ignore: only_throw_errors
      throw failWith!;
    }
    accepted.add(documentIds);
    return const [];
  }
}

const _docs = [
  PendingLegalDocument(
    id: 'id-eula',
    docType: 'eula',
    version: '2026-10-05.1',
    title: 'End User License Agreement',
  ),
  PendingLegalDocument(
    id: 'id-client',
    docType: 'client_agreement',
    version: '2026-10-05.2',
    title: 'Client Agreement',
    updated: true,
  ),
  PendingLegalDocument(
    id: 'id-terms',
    docType: 'terms',
    version: '2026-10-05.1',
    title: 'Terms of Service',
  ),
];

final _client = meFixture(
  role: UserRole.client,
  consents: true,
  firstName: 'Ann',
  lastName: 'Lee',
  email: 'ann@example.com',
  emailVerified: true,
  phone: '+15551234567',
  phoneVerified: true,
  completed: true,
  pendingLegal: _docs,
);

List<Override> _overrides(_FakeLegalRepository repo, Translator t) => [
      currentUserControllerProvider.overrideWith(
          () => FixedUserController(CurrentUserState.ready(_client)),),
      legalRepositoryProvider.overrideWithValue(repo),
    ];

Future<void> _tick(WidgetTester tester, String title) async {
  final f = find.text('I have read and accept: $title');
  await tester.ensureVisible(f);
  await tester.pump();
  await tester.tap(f);
  await tester.pump();
}

Finder get _button => find.byKey(const ValueKey('legal-accept-button'));

AppButton _buttonWidget(WidgetTester tester) =>
    tester.widget<AppButton>(_button);

void main() {
  Future<_FakeLegalRepository> pump(
    WidgetTester tester, {
    Translator t = const StaticTranslatorEn(),
    TextDirection dir = TextDirection.ltr,
    double textScale = 1,
  }) async {
    useNarrowPhone(tester);
    final repo = _FakeLegalRepository();
    await tester.pumpWidget(
      uxApp(
        Directionality(textDirection: dir, child: const LegalAcceptScreen()),
        theme: AppTheme.light(),
        size: narrowPhone,
        textScale: textScale,
        disableAnimations: true,
        overrides: uxOverrides(translator: t, extra: _overrides(repo, t)),
      ),
    );
    await tester.pumpAndSettle();
    return repo;
  }

  testWidgets('lists every document with its own unticked box', (tester) async {
    await pump(tester);
    // Main agreements first, in a fixed order.
    final order = [
      'legal-accept-terms',
      'legal-accept-client_agreement',
      'legal-accept-eula',
    ];
    final ys = [
      for (final k in order) tester.getTopLeft(find.byKey(ValueKey(k))).dy,
    ];
    expect(ys, [...ys]..sort());
    expect(
        find.text('I have read and accept: Terms of Service'), findsOneWidget,);
    expect(
        find.text('I have read and accept: Client Agreement'), findsOneWidget,);
    expect(
      find.text('I have read and accept: End User License Agreement'),
      findsOneWidget,
    );
    // The changed document says so.
    expect(find.textContaining('updated'), findsOneWidget);
    expect(find.text('Read in full'), findsNWidgets(3));
    // Nothing is pre-ticked, so «Accept» is inert.
    expect(_buttonWidget(tester).isEnabled, isFalse);
  });

  testWidgets('«Accept» stays inert until every box is ticked', (tester) async {
    final repo = await pump(tester);
    await _tick(tester, 'Terms of Service');
    await _tick(tester, 'Client Agreement');
    expect(_buttonWidget(tester).isEnabled, isFalse);
    await tester.tap(_button);
    await tester.pump();
    expect(repo.accepted, isEmpty);

    await _tick(tester, 'End User License Agreement');
    expect(_buttonWidget(tester).isEnabled, isTrue);
    await tester.tap(_button);
    await tester.pumpAndSettle();
    expect(repo.accepted, hasLength(1));
    expect(repo.accepted.single,
        unorderedEquals(['id-eula', 'id-client', 'id-terms']),);
  });

  testWidgets('unticking a document disables the button again', (tester) async {
    await pump(tester);
    for (final t in [
      'Terms of Service',
      'Client Agreement',
      'End User License Agreement',
    ]) {
      await _tick(tester, t);
    }
    expect(_buttonWidget(tester).isEnabled, isTrue);
    await _tick(tester, 'Client Agreement');
    expect(_buttonWidget(tester).isEnabled, isFalse);
  });

  testWidgets('a failed request shows the reason and keeps the ticks',
      (tester) async {
    final repo = await pump(tester);
    repo.failWith = const ApiException(
      code: ApiException.networkErrorCode,
      message: 'offline',
    );
    for (final t in [
      'Terms of Service',
      'Client Agreement',
      'End User License Agreement',
    ]) {
      await _tick(tester, t);
    }
    await tester.tap(_button);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('legal-accept-error')), findsOneWidget);
    expect(_buttonWidget(tester).isEnabled, isTrue);
  });

  final locales = <String, (Translator, TextDirection)>{
    'longest of all languages': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };
  for (final e in locales.entries) {
    for (final scale in [1.0, 1.6]) {
      testWidgets('no overflow: ${e.key}, text x$scale', (tester) async {
        await pump(tester, t: e.value.$1, dir: e.value.$2, textScale: scale);
        expect(tester.takeException(), isNull);
        // Ticking everything must not overflow either (the check mark).
        final boxes = find.byType(InkWell);
        for (var i = 0; i < boxes.evaluate().length; i++) {
          await tester.ensureVisible(boxes.at(i));
        }
        expect(tester.takeException(), isNull);
      });
    }
  }
}
