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
import 'package:lawbid/features/onboarding/domain/profile_input.dart';
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

  test('saveProfileStep sends the structured client profile (not data JSON)', () async {
    await repo.saveProfileStep(
      OnboardingStepId.push,
      const ClientProfileInput(
        firstName: ' Ann ',
        lastName: 'Lee ',
        stateCode: 'NY',
        languages: ['es', 'en'],
        contactMethod: 'in_app_chat',
        contactNote: ' Evenings ',
      ),
    );
    final req = adapter.requests.single;
    expect(req.method, 'PATCH');
    expect(req.path, '/users/me/onboarding');
    expect(bodyOf(req), {
      'currentStep': 'push',
      'profile': {
        'firstName': 'Ann',
        'lastName': 'Lee',
        'stateCode': 'NY',
        'languages': ['en', 'es'],
        'contactMethod': 'in_app_chat',
        'contactNote': 'Evenings',
      },
    });
  });

  test('saveProfileStep sends the structured attorney profile', () async {
    await repo.saveProfileStep(
      OnboardingStepId.push,
      const AttorneyProfileInput(
        firstName: 'Avery',
        lastName: 'Quill',
        bio: 'Bio',
        firmName: '',
        languages: ['fr'],
        licensedStates: ['NY', 'CA'],
      ),
    );
    expect(bodyOf(adapter.requests.single)['profile'], {
      'firstName': 'Avery',
      'lastName': 'Quill',
      'bio': 'Bio',
      'firmName': '',
      'languages': ['fr'],
      'licensedStates': ['CA', 'NY'],
    });
  });

  test('GET /users/me profile parses per role; state/licensed_states map to profile', () async {
    final client = CurrentUser.fromJson({
      ...meJson(role: 'client', missing: const ['state']),
      'profile': {
        'stateCode': 'TX',
        'languages': ['es'],
        'contactMethod': 'sms',
        'contactNote': 'Mornings',
      },
    });
    expect(client.clientProfile?.stateCode, 'TX');
    expect(client.clientProfile?.languages, ['es']);
    expect(client.clientProfile?.contactMethod, 'sms');
    expect(client.attorneyProfile, isNull);
    expect(client.missing, {MissingRequirement.profile});

    final attorney = CurrentUser.fromJson({
      ...meJson(role: 'attorney', missing: const ['licensed_states']),
      'profile': {
        'username': 'avery.quill',
        'bio': null,
        'firmName': 'Firm',
        'languages': ['en'],
        'licensedStates': ['CA', 'NY'],
        'verificationStatus': 'unverified',
      },
    });
    expect(attorney.attorneyProfile?.username, 'avery.quill');
    expect(attorney.attorneyProfile?.licensedStates, ['CA', 'NY']);
    expect(attorney.clientProfile, isNull);
    expect(attorney.missing, {MissingRequirement.profile});

    expect(CurrentUser.fromJson({...meJson(role: 'client'), 'profile': null}).clientProfile, isNull);
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
    // Each endpoint answers with its OpenAPI 2xx shape: the generated
    // client parses every response body, not just the ones the app reads.
    adapter.handler = (o) async => switch (o.path) {
          '/auth/reauth' => ok({'reauthToken': 'rt-1'}),
          '/users/me/contacts/verify' => ok({'verified': true}),
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

  test('saveProfileStep keeps an explicit contactMethod: null (clears it)', () async {
    await repo.saveProfileStep(
      OnboardingStepId.push,
      const ClientProfileInput(firstName: 'Ann', lastName: 'Lee', stateCode: 'NY'),
    );
    final profile = bodyOf(adapter.requests.single)['profile'] as Map<String, dynamic>;
    expect(profile.containsKey('contactMethod'), isTrue);
    expect(profile['contactMethod'], isNull);
  });

  test('fetchMe maps the generated MeDto per role, dropping unknown enum values', () async {
    adapter.handler = (o) async => ok({
          ...meJson(role: 'attorney', missing: const ['licensed_states', 'brand_new_rule']),
          'status': 'some_future_status',
          'profile': {
            'username': 'avery.quill',
            'bio': null,
            'firmName': 'Firm',
            'languages': ['en'],
            'licensedStates': ['CA', 'NY'],
            'verificationStatus': 'pending',
          },
          'onboarding': {
            'currentStep': 'tour',
            'completedAt': '2026-09-20T12:00:00.000Z',
            'data': {'pushOptIn': true},
          },
        });
    final me = await repo.fetchMe();
    expect(me.role, UserRole.attorney);
    expect(me.status, 'active', reason: 'unknown status falls back like fromJson');
    expect(me.attorneyProfile?.username, 'avery.quill');
    expect(me.attorneyProfile?.licensedStates, ['CA', 'NY']);
    expect(me.attorneyProfile?.verificationStatus, 'pending');
    expect(me.clientProfile, isNull);
    expect(me.missing, {MissingRequirement.profile});
    expect(me.onboarding.currentStep, OnboardingStepId.tour);
    expect(me.onboarding.completedAt, DateTime.utc(2026, 9, 20, 12));
    expect(me.onboarding.data, {'pushOptIn': true});
  });

  test('a me body outside the contract (no id) → NETWORK_ERROR', () async {
    adapter.handler = (o) async => ok(<String, dynamic>{...meJson()}..remove('id'));
    await expectLater(
      repo.fetchMe(),
      throwsA(isA<ApiException>().having((e) => e.isNetworkError, 'isNetworkError', isTrue)),
    );
  });

  test('transport failure → NETWORK_ERROR', () async {
    adapter.handler = (o) async => throwConnectionError(o);
    await expectLater(
      repo.fetchMe(),
      throwsA(isA<ApiException>().having((e) => e.isNetworkError, 'isNetworkError', isTrue)),
    );
  });
}
