import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/core/session/session_state.dart';
import 'package:lawbid/features/auth/application/passkeys_providers.dart';
import 'package:lawbid/features/auth/data/auth_dtos.dart';
import 'package:lawbid/features/auth/data/passkey_authenticator.dart';
import 'package:lawbid/features/auth/data/passkeys_api_client.dart';
import 'package:lawbid/features/auth/data/passkeys_repository.dart';
import 'package:lawbid/features/auth/presentation/widgets/passkeys_section.dart';

import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/fake_http_adapter.dart';
import '../../helpers/ux_harness.dart';
import 'passkey_fakes.dart';

/// Owner 2026-10-22 (checklist §1): passkeys against the API worker's
/// `@simplewebauthn/server` endpoints — options in, the device's response
/// out, tokens applied on a sign-in; Settings → Security lists, adds and
/// removes keys.
class _Session extends SessionController {
  final applied = <String>[];

  @override
  SessionState? build() => null;

  @override
  Future<void> applyTokens(AuthTokensResult tokens) async {
    applied.add(tokens.accessToken);
    state = SessionState(
      accessToken: tokens.accessToken,
      sub: 'user-1',
      role: 'client',
      sid: 's1',
      verified: true,
      subscriptionStatus: 'none',
      accessTokenExpiresAt: DateTime.utc(2030),
    );
  }
}

const _creationOptions = {
  'challenge': 'Y2hhbGxlbmdl',
  'rp': {'name': 'LawBid', 'id': 'lawbid.dev'},
  'user': {'id': 'dXNlci0x', 'name': '+1555', 'displayName': 'Ann'},
  'pubKeyCredParams': [
    {'type': 'public-key', 'alg': -7},
  ],
  'timeout': 60000,
  'attestation': 'none',
  'authenticatorSelection': {
    'residentKey': 'preferred',
    'userVerification': 'preferred',
  },
};

const _requestOptions = {
  'challenge': 'Y2hhbGxlbmdl',
  'rpId': 'lawbid.dev',
  'timeout': 60000,
  'userVerification': 'preferred',
};

Map<String, Object?> _key(String id, {String name = 'iPhone'}) => {
      'id': id,
      'name': name,
      'deviceType': 'multiDevice',
      'backedUp': true,
      'transports': ['internal'],
      'createdAt': '2026-10-22T10:00:00Z',
      'lastUsedAt': null,
    };

void main() {
  setUpAll(initializeDateFormatting);

  late FakeHttpAdapter adapter;
  late Dio dio;
  late List<RequestOptions> requests;

  setUp(() {
    requests = [];
    adapter = FakeHttpAdapter((o) async {
      requests.add(o);
      switch ((o.method, o.path)) {
        case ('POST', '/auth/passkeys/register/options'):
          return ok({'options': _creationOptions});
        case ('POST', '/auth/passkeys/register'):
          return jsonBody({'data': _key('k-new', name: 'Pixel')}, 201);
        case ('POST', '/auth/passkeys/login/options'):
          return ok({'challengeId': 'ch-1', 'options': _requestOptions});
        case ('POST', '/auth/passkeys/login'):
          return jsonBody(
            {
              'data': {
                'accessToken': 'at-passkey',
                'refreshToken': 'rt',
                'accessTokenExpiresIn': 900,
                'isNewUser': false,
              },
            },
            201,
          );
        case ('POST', '/auth/passkeys/reauth/options'):
          return ok({'challengeId': 'ch-2', 'options': _requestOptions});
        case ('POST', '/auth/passkeys/reauth'):
          return ok({'reauthToken': 'reauth-1'});
        case ('GET', '/auth/passkeys'):
          return ok({
            'passkeys': [_key('k-1'), _key('k-2', name: 'YubiKey')],
          });
        case ('DELETE', _):
          return ok({'removed': true});
      }
      return apiError(404, 'NOT_FOUND');
    });
    dio = Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))
      ..httpClientAdapter = adapter;
  });

  Map<String, Object?> body(RequestOptions o) =>
      jsonDecode(jsonEncode(o.data)) as Map<String, Object?>;

  group('ApiPasskeysRepository', () {
    test('sign in: options → authenticator → verify → session', () async {
      final auth = FakePasskeyAuthenticator();
      final session = _Session();
      final container = ProviderContainer(
        overrides: [sessionControllerProvider.overrideWith(() => session)],
      );
      addTearDown(container.dispose);
      final repo = ApiPasskeysRepository(
        client: PasskeysApiClient(dio),
        authenticator: auth,
        session: container.read(sessionControllerProvider.notifier),
      );
      final r = await repo.signIn();
      expect(r.isSuccess, isTrue);
      expect(auth.authenticateOptions.single['rpId'], 'lawbid.dev');
      final verify = requests.last;
      expect(verify.path, '/auth/passkeys/login');
      // No bearer header on the token-issuing calls.
      expect(verify.extra['skipAuth'], isTrue);
      expect(body(verify)['challengeId'], 'ch-1');
      expect(
        (body(verify)['response']! as Map)['id'],
        'cred-1',
      );
      expect(
        container.read(sessionControllerProvider)?.accessToken,
        'at-passkey',
      );
    });

    test('sign in: the device cancels / has no key / is unsupported', () async {
      for (final (failure, status) in [
        (PasskeyFailure.cancelled, PasskeySignInStatus.cancelled),
        (PasskeyFailure.noCredentials, PasskeySignInStatus.noCredentials),
        (PasskeyFailure.unsupported, PasskeySignInStatus.unsupported),
        (PasskeyFailure.other, PasskeySignInStatus.failed),
      ]) {
        final container = ProviderContainer(
          overrides: [sessionControllerProvider.overrideWith(_Session.new)],
        );
        addTearDown(container.dispose);
        final repo = ApiPasskeysRepository(
          client: PasskeysApiClient(dio),
          authenticator: FakePasskeyAuthenticator(failWith: failure),
          session: container.read(sessionControllerProvider.notifier),
        );
        expect((await repo.signIn()).status, status, reason: '$failure');
        expect(container.read(sessionControllerProvider), isNull);
      }
    });

    test('add: register options → authenticator → verify with the response',
        () async {
      final auth = FakePasskeyAuthenticator();
      final container = ProviderContainer(
        overrides: [sessionControllerProvider.overrideWith(_Session.new)],
      );
      addTearDown(container.dispose);
      final repo = ApiPasskeysRepository(
        client: PasskeysApiClient(dio),
        authenticator: auth,
        session: container.read(sessionControllerProvider.notifier),
      );
      final key = await repo.add(name: 'Pixel');
      expect(key.name, 'Pixel');
      expect(auth.registerOptions.single['rp'], {
        'name': 'LawBid',
        'id': 'lawbid.dev',
      });
      final verify = requests.last;
      expect(verify.path, '/auth/passkeys/register');
      expect(body(verify)['name'], 'Pixel');
      expect((body(verify)['response']! as Map)['type'], 'public-key');
      final keys = await repo.list();
      expect(keys.map((k) => k.name), ['iPhone', 'YubiKey']);
      await repo.remove('k-2');
      expect(requests.last.method, 'DELETE');
      expect(requests.last.path, '/auth/passkeys/k-2');
      // Reauth with the key: a single-use token for a sensitive action.
      expect(await repo.reauth(), 'reauth-1');
      expect(body(requests.last)['challengeId'], 'ch-2');
    });

    test('login options carry the challenge id', () async {
      final c = await PasskeysApiClient(dio).loginOptions();
      expect(c.challengeId, 'ch-1');
      expect(c.options['rpId'], 'lawbid.dev');
    });
  });

  group('PasskeysSection (Settings → Security)', () {
    Future<void> pump(
      WidgetTester tester,
      FakePasskeyAuthenticator auth,
    ) async {
      // The device id of `deviceInfoProvider` lives in SharedPreferences.
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      await tester.pumpWidget(
        uxApp(
          const Scaffold(body: SingleChildScrollView(child: PasskeysSection())),
          theme: AppTheme.light(),
          disableAnimations: true,
          overrides: uxOverrides(
            extra: [
              sharedPreferencesProvider.overrideWithValue(prefs),
              dioProvider.overrideWithValue(dio),
              passkeyAuthenticatorProvider.overrideWithValue(auth),
              sessionControllerProvider.overrideWith(_Session.new),
            ],
          ),
        ),
      );
    }

    testWidgets('lists the keys, adds one, removes one', (tester) async {
      await pump(tester, FakePasskeyAuthenticator());
      await tester.pumpAndSettle();
      expect(find.text('iPhone'), findsOneWidget);
      expect(find.text('YubiKey'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('passkey-add')));
      await tester.pumpAndSettle();
      expect(find.text('Pixel'), findsOneWidget);
      expect(
        requests.any((r) => r.path.endsWith('/passkeys/register')),
        isTrue,
      );

      await tester.tap(
        find.descendant(
          of: find.byKey(const ValueKey('passkey-k-2')),
          matching: find.byType(AppIconButton),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Delete'));
      await tester.pumpAndSettle();
      expect(find.text('YubiKey'), findsNothing);
      expect(requests.last.method, 'DELETE');
      expect(tester.takeException(), isNull);
    });

    testWidgets('hidden on a device without passkey support', (tester) async {
      await pump(tester, FakePasskeyAuthenticator(supported: false));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('passkey-add')), findsNothing);
      expect(requests, isEmpty);
    });
  });
}
