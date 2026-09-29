import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/features/subscription/data/subscription_repository_impl.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';

import '../../helpers/fake_http_adapter.dart';

Map<String, dynamic> _subscription({String status = 'trialing'}) => {
      'id': 'sub_1',
      'status': status,
      'isActive': status == 'trialing' || status == 'active',
      'priceCents': 39900,
      'trialEndsAt': '2026-10-06T12:00:00.000Z',
      'currentPeriodEnd': null,
      'cancelAtPeriodEnd': false,
      'canceledAt': null,
      'graceEndsAt': status == 'past_due' ? '2026-10-09T12:00:00.000Z' : null,
      'createdAt': '2026-09-29T10:00:00.000Z',
    };

Map<String, dynamic> _me({Map<String, dynamic>? subscription}) => {
      'subscription': subscription,
      'isActive': subscription?['isActive'] ?? false,
      'canStart': subscription == null,
      'trialEligible': subscription == null,
      'priceCents': 39900,
    };

void main() {
  late FakeHttpAdapter adapter;
  late ApiSubscriptionRepository repo;

  setUp(() {
    adapter = FakeHttpAdapter((o) async => ok(_me()));
    final dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
      ..httpClientAdapter = adapter
      ..interceptors.add(IdempotencyInterceptor(keyFactory: () => 'key-1'));
    repo = ApiSubscriptionRepository(dio);
  });

  test('overview: no subscription yet', () async {
    final o = await repo.overview();
    expect(o.subscription, isNull);
    expect(o.canStart, isTrue);
    expect(o.trialEligible, isTrue);
    expect(o.priceCents, 39900);
    expect(adapter.requests.single.path, '/subscriptions/me');
  });

  test('overview maps the subscription row (status, dates, grace)', () async {
    adapter.handler =
        (o) async => ok(_me(subscription: _subscription(status: 'past_due')));
    final s = (await repo.overview()).subscription!;
    expect(s.status, SubscriptionStatus.pastDue);
    expect(s.paymentFailed, isTrue);
    expect(s.graceEndsAt, DateTime.utc(2026, 10, 9, 12));
    expect(s.trialEndsAt, DateTime.utc(2026, 10, 6, 12));
    expect(s.isActive, isFalse);
  });

  test('an unknown future status does not crash the screen', () async {
    adapter.handler =
        (o) async => ok(_me(subscription: _subscription(status: 'paused')));
    expect((await repo.overview()).subscription!.status,
        SubscriptionStatus.unknown);
  });

  test('start returns the SetupIntent secret and trial eligibility', () async {
    adapter.handler = (o) async => ok({
          'clientSecret': 'seti_secret',
          'setupIntentId': 'seti_1',
          'customerId': 'cus_1',
          'trialEligible': false,
          'priceCents': 39900,
          'trialDays': 7,
        });
    final s = await repo.start();
    expect(adapter.requests.single.method, 'POST');
    expect(adapter.requests.single.path, '/subscriptions/start');
    expect(s.clientSecret, 'seti_secret');
    expect(s.trialEligible, isFalse);
    expect(s.trialDays, 7);
  });

  test('confirm sends setupIntentId; chargeNow only when consented', () async {
    adapter.handler =
        (o) async => ok(_me(subscription: _subscription(status: 'active')));
    await repo.confirm('seti_1');
    expect(adapter.requests.last.data, {'setupIntentId': 'seti_1'});

    final o = await repo.confirm('seti_1', chargeNow: true);
    expect(adapter.requests.last.data,
        {'setupIntentId': 'seti_1', 'chargeNow': true});
    expect(o.subscription!.status, SubscriptionStatus.active);
  });

  test('confirm: TRIAL_UNAVAILABLE surfaces as ApiException with details',
      () async {
    adapter.handler = (o) async => apiError(
        409, 'SUBSCRIPTION_TRIAL_UNAVAILABLE', {'chargeNowCents': 39900});
    try {
      await repo.confirm('seti_1');
      fail('expected ApiException');
    } on ApiException catch (e) {
      expect(e.code, ApiErrorCodes.subscriptionTrialUnavailable);
      expect(e.details?['chargeNowCents'], 39900);
    }
  });

  test('payments: cursor page with statuses and failure code', () async {
    adapter.handler = (o) async => jsonBody({
          'data': [
            {
              'id': 'p1',
              'amountCents': 39900,
              'currency': 'usd',
              'status': 'succeeded',
              'paidAt': '2026-10-06T12:00:00.000Z',
              'failureCode': null,
              'createdAt': '2026-10-06T12:00:00.000Z',
            },
            {
              'id': 'p2',
              'amountCents': 39900,
              'currency': 'usd',
              'status': 'failed',
              'paidAt': null,
              'failureCode': 'card_declined',
              'createdAt': '2026-11-06T12:00:00.000Z',
            },
          ],
          'meta': {'nextCursor': 'c2'},
        });
    final page = await repo.payments(cursor: 'c1');
    expect(adapter.requests.single.uri.queryParameters['cursor'], 'c1');
    expect(page.items.map((p) => p.status),
        [PaymentStatus.succeeded, PaymentStatus.failed]);
    expect(page.items[1].failureCode, 'card_declined');
    expect(page.nextCursor, 'c2');
  });

  test('portalUrl: absolute https URL; garbage is a network-shaped error',
      () async {
    adapter.handler =
        (o) async => ok({'url': 'https://billing.stripe.com/p/session_1'});
    expect((await repo.portalUrl()).host, 'billing.stripe.com');
    adapter.handler = (o) async => ok({'url': 'not a url'});
    expect(repo.portalUrl, throwsA(isA<ApiException>()));
  });

  test('cancel posts and returns the updated overview', () async {
    adapter.handler = (o) async => ok(_me(
        subscription: _subscription(status: 'active')
          ..['cancelAtPeriodEnd'] = true));
    final o = await repo.cancel();
    expect(adapter.requests.single.path, '/subscriptions/cancel');
    expect(o.subscription!.cancelAtPeriodEnd, isTrue);
  });
}
