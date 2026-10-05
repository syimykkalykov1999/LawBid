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
      'plan': 'monthly',
      'assistantSeats': 2,
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
      'prices': {
        'monthlyCents': 39900,
        'seatCents': 10000,
        'yearlyCents': 959000,
        'maxSeats': 6,
        'trialDays': 7,
      },
      // Owner 2026-10-05 (plan builder): the plan, the plans for sale, the
      // entitlements and the seat summary come with the row.
      'plan': subscription == null ? null : _teamPlan,
      'plans': [_teamPlan],
      'entitlements': subscription == null
          ? <String, dynamic>{}
          : _teamPlan['entitlements'],
      'seats': subscription == null
          ? null
          : {'included': 1, 'extra': 2, 'total': 3, 'max': 5},
    };

const _teamPlan = <String, dynamic>{
  'id': '7a1b4e52-1c1e-4f1c-9a4a-6b7d2f0c1e11',
  'code': 'team',
  'audience': 'attorney',
  'kind': 'paid',
  'name': {'en': 'Team', 'ru': 'Команда'},
  'tagline': {'en': 'For firms'},
  'description': <String, dynamic>{},
  'interval': 'month',
  'currency': 'usd',
  'amountCents': 59900,
  'extraSeatCents': 10000,
  'entitlements': {
    'included_seats': 1,
    'max_seats': 5,
    'extra_seat_price_cents': 10000,
    'bids_any_state': true,
    'max_active_bids': 0,
    'priority_search': true,
    'calls': true,
    'chat_translate': false,
    'trial_days': 14,
  },
  'highlights': [
    {'en': 'Best for firms', 'ru': 'Для фирм'},
  ],
  'isDefault': true,
  'trialDays': 14,
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
    expect(
      (await repo.overview()).subscription!.status,
      SubscriptionStatus.unknown,
    );
  });

  test('OQ-048: plan, seats and prices are mapped', () async {
    adapter.handler =
        (o) async => ok(_me(subscription: _subscription(status: 'active')));
    final o = await repo.overview();
    expect(o.subscription!.plan, SubscriptionPlan.monthly);
    expect(o.subscription!.assistantSeats, 2);
    expect(o.prices.yearlyCents, 959000);
    expect(o.prices.monthlyTotal(2), 59900);
    // Owner 2026-10-05 (plan builder).
    expect(o.plan?.code, 'team');
    expect(o.plans.single.name.resolve('ru'), 'Команда');
    expect(o.plans.single.extraSeatsAllowed, 4);
    expect(o.entitlements.prioritySearch, isTrue);
    expect(o.entitlements.maxActiveBids, 0);
    expect(o.seats?.total, 3);
  });

  test('OQ-048: checkout sends the plan, seats and phones', () async {
    adapter.handler = (o) async => ok({
          'url': 'https://checkout.stripe.com/c/pay/cs_1',
          'sessionId': 'cs_1',
          'trialEligible': true,
          'priceCents': 59900,
          'trialDays': 7,
        });
    final c = await repo.checkout(
      assistantSeats: 2,
      assistantPhones: ['+13125550111'],
    );
    expect(adapter.requests.single.path, '/subscriptions/checkout');
    expect(adapter.requests.single.data, {
      'plan': 'monthly',
      'assistantSeats': 2,
      'assistantPhones': ['+13125550111'],
    });
    expect(c.sessionId, 'cs_1');
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
    expect(
      adapter.requests.last.data,
      {'setupIntentId': 'seti_1', 'chargeNow': true},
    );
    expect(o.subscription!.status, SubscriptionStatus.active);
  });

  test('confirm: TRIAL_UNAVAILABLE surfaces as ApiException with details',
      () async {
    adapter.handler = (o) async => apiError(
          409,
          'SUBSCRIPTION_TRIAL_UNAVAILABLE',
          {'chargeNowCents': 39900},
        );
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
    expect(
      page.items.map((p) => p.status),
      [PaymentStatus.succeeded, PaymentStatus.failed],
    );
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
    adapter.handler = (o) async => ok(
          _me(
            subscription: _subscription(status: 'active')
              ..['cancelAtPeriodEnd'] = true,
          ),
        );
    final o = await repo.cancel();
    expect(adapter.requests.single.path, '/subscriptions/cancel');
    expect(o.subscription!.cancelAtPeriodEnd, isTrue);
  });
}
