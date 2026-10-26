import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/auth/application/passkeys_providers.dart';
import 'package:lawbid/features/auth/data/passkey_authenticator.dart';
import 'package:lawbid/features/auth/presentation/widgets/passkey_nudge_sheet.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/shared/domain/user_role.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/ux_harness.dart';

class _Keys implements PasskeysRepository {
  _Keys({this.existing = const [], this.addError});

  List<PasskeyInfo> existing;
  Exception? addError;
  int added = 0;
  int listed = 0;

  @override
  Future<bool> isSupported() async => true;

  @override
  Future<List<PasskeyInfo>> list() async {
    listed++;
    return existing;
  }

  @override
  Future<PasskeyInfo> add({String? name}) async {
    final e = addError;
    if (e != null) throw e;
    added++;
    final k =
        PasskeyInfo(id: 'k$added', name: 'iPhone', createdAt: DateTime(2026));
    existing = [...existing, k];
    return k;
  }

  @override
  Future<void> remove(String id) async {}

  @override
  Future<PasskeySignInResult> signIn() async =>
      const PasskeySignInResult(PasskeySignInStatus.cancelled);

  @override
  Future<String?> reauth() async => null;
}

void main() {
  late SharedPreferences prefs;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
  });

  group('PasskeyNudgePolicy', () {
    test('due at first; «Later» hides it for 7 days, three times at most',
        () async {
      final p = PasskeyNudgePolicy(prefs, 'u1');
      final t0 = DateTime(2026, 10, 24, 12);
      expect(p.due(t0), isTrue);
      await p.later(t0);
      expect(p.due(t0.add(const Duration(days: 6, hours: 23))), isFalse);
      final t1 = t0.add(const Duration(days: 7));
      expect(p.due(t1), isTrue);
      await p.later(t1);
      final t2 = t1.add(const Duration(days: 7));
      expect(p.due(t2), isTrue);
      await p.later(t2);
      // Three «Later» in: retired for good.
      expect(p.due(t2.add(const Duration(days: 365))), isFalse);
    });

    test('shown but not answered hides it for a day only', () async {
      final p = PasskeyNudgePolicy(prefs, 'u1');
      final t0 = DateTime(2026, 10, 24, 12);
      await p.shown(t0);
      expect(p.due(t0.add(const Duration(hours: 23))), isFalse);
      expect(p.due(t0.add(const Duration(days: 1))), isTrue);
    });

    test('turned on = never again; each account has its own state', () async {
      final p = PasskeyNudgePolicy(prefs, 'u1');
      await p.enabled();
      expect(p.due(DateTime(2030)), isFalse);
      expect(PasskeyNudgePolicy(prefs, 'u2').due(DateTime(2030)), isTrue);
    });
  });

  Future<void> host(
    WidgetTester tester,
    _Keys keys, {
    UserRole role = UserRole.attorney,
    bool available = true,
    ThemeData? theme,
    Translator t = const StaticTranslatorEn(),
    double scale = 1,
  }) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      KeyedSubtree(
        key: UniqueKey(),
        child: uxApp(
          Consumer(
            builder: (context, ref, _) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => maybeShowPasskeyNudge(context, ref),
                  child: const Text('go'),
                ),
              ),
            ),
          ),
          theme: theme ?? AppTheme.light(),
          textScale: scale,
          disableAnimations: true,
          overrides: uxOverrides(
            translator: t,
            extra: [
              sharedPreferencesProvider.overrideWithValue(prefs),
              passkeyNudgePolicyProvider
                  .overrideWithValue(PasskeyNudgePolicy(prefs, 'u1')),
              currentUserRoleProvider.overrideWithValue(role),
              passkeysRepositoryProvider.overrideWithValue(keys),
              passkeysAvailableProvider.overrideWith((ref) async => available),
            ],
          ),
        ),
      ),
    );
    await tester.tap(find.text('go'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  testWidgets('an attorney without a key is offered it; «Turn on» enrols',
      (tester) async {
    final keys = _Keys();
    await host(tester, keys);
    expect(
      find.text('Secure your sign-in: Face ID / fingerprint'),
      findsOneWidget,
    );
    await tester.tap(find.byKey(const ValueKey('passkey-nudge-enable')));
    await tester.pump();
    await tester.pump(const Duration(seconds: 2));
    expect(keys.added, 1);
    expect(find.byKey(const ValueKey('passkey-nudge-enable')), findsNothing);
    expect(PasskeyNudgePolicy(prefs, 'u1').due(DateTime(2031)), isFalse);
  });

  testWidgets('«Later» snoozes it', (tester) async {
    await host(tester, _Keys());
    await tester.tap(find.byKey(const ValueKey('passkey-nudge-later')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    final p = PasskeyNudgePolicy(prefs, 'u1');
    expect(p.due(DateTime.now().add(const Duration(days: 6))), isFalse);
    expect(p.due(DateTime.now().add(const Duration(days: 8))), isTrue);
  });

  testWidgets('a cancelled system sheet counts as «Later»', (tester) async {
    final keys = _Keys(
      addError: const PasskeyAuthenticatorException(PasskeyFailure.cancelled),
    );
    await host(tester, keys);
    await tester.tap(find.byKey(const ValueKey('passkey-nudge-enable')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const ValueKey('passkey-nudge-enable')), findsNothing);
    expect(PasskeyNudgePolicy(prefs, 'u1').due(DateTime.now()), isFalse);
  });

  testWidgets('a real failure stays on the sheet with a line of text',
      (tester) async {
    final keys = _Keys(
      addError: const PasskeyAuthenticatorException(PasskeyFailure.other),
    );
    await host(tester, keys);
    await tester.tap(find.byKey(const ValueKey('passkey-nudge-enable')));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byKey(const ValueKey('passkey-nudge-error')), findsOneWidget);
    expect(find.byKey(const ValueKey('passkey-nudge-enable')), findsOneWidget);
  });

  testWidgets('not shown to clients, without passkey support, or with a key',
      (tester) async {
    await host(tester, _Keys(), role: UserRole.client);
    expect(find.byKey(const ValueKey('passkey-nudge-enable')), findsNothing);
    await host(tester, _Keys(), available: false);
    expect(find.byKey(const ValueKey('passkey-nudge-enable')), findsNothing);
    final has = _Keys(
      existing: [
        PasskeyInfo(id: 'x', name: 'Pixel', createdAt: DateTime(2026)),
      ],
    );
    await host(tester, has);
    expect(find.byKey(const ValueKey('passkey-nudge-enable')), findsNothing);
    // It also remembers the account has a key.
    expect(PasskeyNudgePolicy(prefs, 'u1').due(DateTime(2031)), isFalse);
  });

  testWidgets('an assistant is offered it too', (tester) async {
    await host(tester, _Keys(), role: UserRole.assistant);
    expect(find.byKey(const ValueKey('passkey-nudge-enable')), findsOneWidget);
  });

  for (final id in AppThemeId.values) {
    testWidgets('longest strings, 2x text: no overflow in ${id.name}',
        (tester) async {
      await host(
        tester,
        _Keys(),
        theme: AppTheme.of(id),
        t: LongestTranslator(),
        scale: 2,
      );
      expect(
        find.byKey(const ValueKey('passkey-nudge-enable')),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    });
  }
}
