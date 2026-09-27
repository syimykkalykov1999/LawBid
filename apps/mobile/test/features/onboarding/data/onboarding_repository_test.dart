import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/features/auth/data/auth_api_client.dart';
import 'package:lawbid/features/onboarding/data/onboarding_repository.dart';
import 'package:lawbid/features/onboarding/data/users_api_client.dart';
import 'package:lawbid/features/onboarding/domain/consent_type.dart';
import 'package:lawbid/features/onboarding/domain/contact_type.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../../helpers/fake_http_adapter.dart';

Map<String, dynamic> meJson({
  String? role,
  String? step,
  List<String> missing = const ['consents', 'role', 'name'],
}) =>
    {
      'id': 'u1',
      'role': role,
      'status': 'active',
      'firstName': null,
      'lastName': null,
      'email': 'a@b.co',
      'emailVerified': true,
      'phone': null,
      'phoneVerified': false,
      'uiLanguage': 'en',
      'theme': 'system',
      'requiredConsentsGranted': false,
      'onboarding': {
        'currentStep': step,
        'completedAt': null,
        'data': {
          'profile': {'state': 'NY'},
        },
      },
      'missing': missing,
    };

Map<String, dynamic> bodyOf(RequestOptions o) =>
    o.data is String ? jsonDecode(o.data as String) as Map<String, dynamic> : o.data as Map<String, dynamic>;

void main() {
  late FakeHttpAdapter adapter;
  late ApiOnboardingRepository repo;

  setUp(() {
    adapter = FakeHttpAdapter((o) async => ok(meJson()));
    final dio = Dio(BaseOptions(baseUrl: 'http://test/api/v1'))
      ..httpClientAdapter = adapter
      ..interceptors.add(IdempotencyInterceptor(keyFactory: () => 'k'));
    repo = ApiOnboardingRepository(UsersApiClient(dio), AuthApiClient(dio));
  });

  test('fetchMe parses the MeView envelope', () async {
    adapter.handler = (o) async => ok(
          meJson(role: 'client', step: 'contacts', missing: ['name', 'phone_verified', 'unknown_future_value']),
        );
    final me = await repo.fetchMe();
    expect(adapter.requests.single.method, 'GET');
    expect(adapter.requests.single.path, '/users/me');
    expect(me.role, UserRole.client);
    expect(me.onboarding.currentStep, OnboardingStepId.contacts);
    expect(me.onboarding.data['profile'], {'state': 'NY'});
    expect(me.missing, {MissingRequirement.name, MissingRequirement.phoneVerified});
    expect(me.reauthIdentifier, (channel: 'email', identifier: 'a@b.co'));
  });

  test('setRole POSTs the role with an Idempotency-Key', () async {
    adapter.handler = (o) async => ok(meJson(role: 'attorney'));
    final me = await repo.setRole(UserRole.attorney);
    final req = adapter.requests.single;
    expect(req.method, 'POST');
    expect(req.path, '/users/me/role');
    expect(bodyOf(req), {'role': 'attorney'});
    expect(req.headers['Idempotency-Key'], 'k');
    expect(me.role, UserRole.attorney);
  });

  test('setRole: 409 ROLE_ALREADY_SET for the same role is success', () async {
    adapter.handler = (o) async =>
        o.method == 'POST' ? apiError(409, 'ROLE_ALREADY_SET') : ok(meJson(role: 'client'));
    final me = await repo.setRole(UserRole.client);
    expect(me.role, UserRole.client);
    expect(adapter.requests.map((r) => r.method), ['POST', 'GET']);
  });

  test('setRole: 409 ROLE_ALREADY_SET for a different role is rethrown', () async {
    adapter.handler = (o) async =>
        o.method == 'POST' ? apiError(409, 'ROLE_ALREADY_SET') : ok(meJson(role: 'attorney'));
    await expectLater(
      repo.setRole(UserRole.client),
      throwsA(isA<ApiException>().having((e) => e.code, 'code', ApiErrorCodes.roleAlreadySet)),
    );
  });

  test('saveStep PATCHes currentStep + merged data', () async {
    await repo.saveStep(OnboardingStepId.push, {'pushOptIn': true});
    final req = adapter.requests.single;
    expect(req.method, 'PATCH');
    expect(req.path, '/users/me/onboarding');
    expect(bodyOf(req), {
      'currentStep': 'push',
      'data': {'pushOptIn': true},
    });
  });

  test('updateProfile trims names and omits absent fields', () async {
    await repo.updateProfile(firstName: '  Ann ', lastName: 'Lee');
    expect(bodyOf(adapter.requests.single), {'firstName': 'Ann', 'lastName': 'Lee'});
  });

  test('completeOnboarding surfaces CLIENT_CONTACTS_INCOMPLETE with details.missing', () async {
    adapter.handler = (o) async => apiError(403, 'CLIENT_CONTACTS_INCOMPLETE', {
          'missing': ['email_verified'],
        });
    await expectLater(
      repo.completeOnboarding(),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', ApiErrorCodes.clientContactsIncomplete)
            .having((e) => e.details?['missing'], 'missing', ['email_verified']),
      ),
    );
  });

  test('saveConsents sends every decision with wire names', () async {
    adapter.handler = (o) async => ok({'saved': true});
    await repo.saveConsents(const [
      ConsentDecision(type: ConsentType.age18, granted: true),
      ConsentDecision(type: ConsentType.marketingPush, granted: false, documentId: 'doc-1'),
    ]);
    final req = adapter.requests.single;
    expect(req.path, '/users/me/consents');
    expect(req.headers['Idempotency-Key'], 'k');
    expect(bodyOf(req), {
      'consents': [
        {'type': 'age_18', 'granted': true},
        {'type': 'marketing_push', 'granted': false, 'documentId': 'doc-1'},
      ],
    });
  });

  test('contact verification: reauth → request (X-Reauth-Token) → verify', () async {
    adapter.handler = (o) async => switch (o.path) {
          '/auth/reauth' => ok({'reauthToken': 'rt-1'}),
          _ => ok({'sent': true}),
        };
    await repo.requestReauthCode(channel: 'email', identifier: 'a@b.co');
    final token = await repo.reauth(identifier: 'a@b.co', code: '123456');
    await repo.requestContactCode(type: ContactType.phone, value: '+15551234567', reauthToken: token);
    await repo.verifyContact(type: ContactType.phone, value: '+15551234567', code: '654321');

    expect(adapter.requests.map((r) => r.path), [
      '/auth/otp/request',
      '/auth/reauth',
      '/users/me/contacts/request',
      '/users/me/contacts/verify',
    ]);
    expect(bodyOf(adapter.requests[0]), {'channel': 'email', 'identifier': 'a@b.co'});
    expect(bodyOf(adapter.requests[1]), {'method': 'otp', 'identifier': 'a@b.co', 'code': '123456'});
    expect(adapter.requests[2].headers['X-Reauth-Token'], 'rt-1');
    expect(bodyOf(adapter.requests[2]), {'type': 'phone', 'value': '+15551234567'});
    expect(bodyOf(adapter.requests[3]), {'type': 'phone', 'value': '+15551234567', 'code': '654321'});
  });

  for (final code in [
    'CONTACT_DOMAIN_BLOCKED',
    'CONTACT_ALREADY_EXISTS',
    'PHONE_COUNTRY_NOT_SUPPORTED',
    'PROVIDER_BUDGET_EXCEEDED',
    'AUTH_OTP_INVALID',
  ]) {
    test('maps $code to ApiException(code)', () async {
      adapter.handler = (o) async => apiError(code == 'PROVIDER_BUDGET_EXCEEDED' ? 503 : 400, code);
      await expectLater(
        repo.requestContactCode(type: ContactType.email, value: 'x@relay.example', reauthToken: 't'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', code)),
      );
    });
  }

  test('transport failure → NETWORK_ERROR', () async {
    adapter.handler = (o) async => throwConnectionError(o);
    await expectLater(
      repo.fetchMe(),
      throwsA(isA<ApiException>().having((e) => e.isNetworkError, 'isNetworkError', isTrue)),
    );
  });
}
