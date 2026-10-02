// ignore_for_file: lines_longer_than_80_chars
import 'dart:async';
import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/data/card_collector.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';

import 'subscription_fakes.dart';

/// docs/06 §1.4 "Старт триала" as a state machine: start → card sheet →
/// confirm → poll; the no-trial consent (§1.1) before the card and after
/// it; cancellations and failures leave the controller idle.
void main() {
  late FakeSubscriptionRepository repo;
  late FakeCardCollector collector;
  late ProviderContainer container;
  final asked = <int>[];
  var consent = true;

  CardCollectionRequest request(SubscriptionStart s) => CardCollectionRequest(
        clientSecret: s.clientSecret,
        customerId: s.customerId,
        dark: false,
        primaryColor: const Color(0xFF0A1A3F),
      );

  Future<SubscribeOutcome> run() =>
      container.read(subscribeControllerProvider.notifier).subscribe(
            confirmChargeNow: (cents) async {
              asked.add(cents);
              return consent;
            },
            buildRequest: request,
          );

  setUp(() {
    asked.clear();
    consent = true;
    repo = FakeSubscriptionRepository(makeOverview());
    collector = FakeCardCollector();
    container = ProviderContainer(
      overrides: [
        subscriptionRepositoryProvider.overrideWithValue(repo),
        cardCollectorProvider.overrideWithValue(collector),
        subscriptionPollIntervalProvider.overrideWithValue(Duration.zero),
      ],
    );
    addTearDown(container.dispose);
    // Keep the autoDispose controller alive for the test.
    container.listen(subscribeControllerProvider, (_, __) {});
  });

  test('trial: start → card → confirm(chargeNow=false) → trialing', () async {
    repo.onConfirm = (_) => makeOverview(subscription: makeInfo());
    expect(await run(), SubscribeOutcome.trialStarted);
    expect(repo.calls, containsAllInOrder(['start', 'confirm:seti_1:false']));
    expect(collector.requests.single.clientSecret, 'seti_secret');
    expect(collector.requests.single.customerId, 'cus_1');
    expect(asked, isEmpty, reason: 'eligible: no charge-now question');
    expect(container.read(subscribeControllerProvider).busy, isFalse);
    // The screen's overview is updated without a refetch.
    final shown = await container.read(subscriptionOverviewProvider.future);
    expect(shown.subscription?.status, SubscriptionStatus.trialing);
  });

  test('no trial on the account: consent is asked BEFORE the card sheet',
      () async {
    repo.startResult = const SubscriptionStart(
      clientSecret: 'seti_secret',
      setupIntentId: 'seti_1',
      customerId: 'cus_1',
      trialEligible: false,
      priceCents: 39900,
      trialDays: 7,
    );
    // ignore: cascade_invocations
    repo.onConfirm = (_) =>
        makeOverview(subscription: makeInfo(status: SubscriptionStatus.active));
    expect(await run(), SubscribeOutcome.activated);
    expect(asked, [39900]);
    expect(repo.calls, contains('confirm:seti_1:true'));
  });

  test('declining the immediate charge: no card sheet, no confirm', () async {
    consent = false;
    repo.startResult = const SubscriptionStart(
      clientSecret: 's',
      setupIntentId: 'seti_1',
      customerId: 'cus_1',
      trialEligible: false,
      priceCents: 39900,
      trialDays: 7,
    );
    expect(await run(), SubscribeOutcome.cancelled);
    expect(collector.requests, isEmpty);
    expect(repo.calls.where((c) => c != 'overview'), ['start']);
  });

  test(
      'card already used for a trial: server says TRIAL_UNAVAILABLE → ask → retry with chargeNow',
      () async {
    repo.confirmError = const ApiException(
      code: 'SUBSCRIPTION_TRIAL_UNAVAILABLE',
      message: 'no trial',
      details: {'chargeNowCents': 39900},
      statusCode: 409,
    );
    // ignore: cascade_invocations
    repo.onConfirm = (chargeNow) => makeOverview(
          subscription: makeInfo(status: SubscriptionStatus.active),
          trialEligible: false,
        );
    expect(await run(), SubscribeOutcome.activated);
    expect(asked, [39900]);
    expect(
      repo.calls.where((c) => c != 'overview'),
      ['start', 'confirm:seti_1:false', 'confirm:seti_1:true'],
    );
    expect(collector.requests, hasLength(1), reason: 'card is not re-asked');
  });

  test('closing the card sheet: cancelled, nothing confirmed, idle', () async {
    collector.error = const CardCollectionCancelled();
    expect(await run(), SubscribeOutcome.cancelled);
    expect(repo.calls.where((c) => c != 'overview'), ['start']);
    final state = container.read(subscribeControllerProvider);
    expect(state.busy, isFalse);
    expect(state.error, isNull);
  });

  test('confirm returns incomplete: polls /me until the webhook lands',
      () async {
    repo.onConfirm = (_) => makeOverview(
          subscription:
              makeInfo(status: SubscriptionStatus.incomplete, isActive: false),
          isActive: false,
          canStart: false,
        );
    repo.overviewQueue.addAll([
      makeOverview(
        subscription:
            makeInfo(status: SubscriptionStatus.incomplete, isActive: false),
        isActive: false,
        canStart: false,
      ),
      makeOverview(subscription: makeInfo()),
    ]);
    expect(await run(), SubscribeOutcome.trialStarted);
    // 2 polls + the overview provider's own first read when it is applied.
    expect(repo.calls.where((c) => c == 'overview').length, 3);
  });

  test('still incomplete after the polling window: pendingConfirmation',
      () async {
    final pending = makeOverview(
      subscription:
          makeInfo(status: SubscriptionStatus.incomplete, isActive: false),
      isActive: false,
      canStart: false,
    );
    repo.onConfirm = (_) => pending;
    expect(await run(), SubscribeOutcome.pendingConfirmation);
    // 15 polls + the overview provider's own first read.
    expect(repo.calls.where((c) => c == 'overview').length, 16);
  });

  test('a failure keeps the error for the screen and returns to idle',
      () async {
    repo.startError =
        const ApiException(code: 'PAYMENTS_NOT_CONFIGURED', message: 'x');
    expect(await run(), SubscribeOutcome.failed);
    final state = container.read(subscribeControllerProvider);
    expect(state.busy, isFalse);
    expect((state.error! as ApiException).code, 'PAYMENTS_NOT_CONFIGURED');
  });

  test('a second tap while busy is ignored', () async {
    repo.hold = null;
    collector.error = null;
    // Make the first run block on the card sheet.
    final blocking = _BlockingCollector();
    container = ProviderContainer(
      overrides: [
        subscriptionRepositoryProvider.overrideWithValue(repo),
        cardCollectorProvider.overrideWithValue(blocking),
        subscriptionPollIntervalProvider.overrideWithValue(Duration.zero),
      ],
    );
    addTearDown(container.dispose);
    container.listen(subscribeControllerProvider, (_, __) {});
    final first = run();
    await Future<void>.delayed(Duration.zero);
    expect(
      container.read(subscribeControllerProvider).phase,
      SubscribePhase.collectingCard,
    );
    expect(await run(), SubscribeOutcome.cancelled);
    blocking.release.complete();
    repo.onConfirm = (_) => makeOverview(subscription: makeInfo());
    expect(await first, SubscribeOutcome.trialStarted);
    expect(repo.calls.where((c) => c == 'start').length, 1);
  });
}

class _BlockingCollector implements CardCollector {
  final release = Completer<void>();

  @override
  Future<void> collect(CardCollectionRequest request) => release.future;
}
