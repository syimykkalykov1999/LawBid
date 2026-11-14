import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/client_plan/application/client_plan_providers.dart';
import 'package:lawbid/features/client_plan/data/client_plan_repository.dart';
import 'package:lawbid/features/client_plan/domain/client_plan_models.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';

import 'subscription_fakes.dart';

class _ClientRepo implements ClientPlanRepository {
  final ids = <String>[];

  @override
  Future<ClientPlanOverview> completeCheckout(String sessionId) async {
    ids.add(sessionId);
    return ClientPlanOverview(isActive: ids.length > 1, trialEligible: false);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

// Detective R2 item 1 (14.11): back from Stripe by
// `/subscription/success?session_id=…` the session is confirmed even though
// the in-memory poll is gone (web: same tab; phone: a fresh screen).
void main() {
  test('attorney: the return link confirms the session until active',
      () async {
    var n = 0;
    final repo = FakeSubscriptionRepository(makeOverview())
      ..onComplete = () => makeOverview(
            subscription: ++n > 1
                ? makeInfo(status: SubscriptionStatus.active)
                : null,
          );
    final c = ProviderContainer(
      overrides: [
        subscriptionRepositoryProvider.overrideWithValue(repo),
        checkoutPollIntervalProvider.overrideWithValue(Duration.zero),
      ],
    );
    addTearDown(c.dispose);
    final sub = c.listen(subscribeControllerProvider, (_, __) {});
    addTearDown(sub.close);
    final outcome = await c
        .read(subscribeControllerProvider.notifier)
        .completeReturn('cs_test_1');
    expect(outcome, SubscribeOutcome.activated);
    expect(repo.calls.where((x) => x == 'complete:cs_test_1'), hasLength(2));
    expect(c.read(subscribeControllerProvider).busy, isFalse);
    final shown = await c.read(subscriptionOverviewProvider.future);
    expect(shown.isActive, isTrue);
  });

  test('attorney: an unpaid session stops after a bounded number of checks',
      () async {
    final repo = FakeSubscriptionRepository(makeOverview());
    final c = ProviderContainer(
      overrides: [
        subscriptionRepositoryProvider.overrideWithValue(repo),
        checkoutPollIntervalProvider.overrideWithValue(Duration.zero),
      ],
    );
    addTearDown(c.dispose);
    final sub = c.listen(subscribeControllerProvider, (_, __) {});
    addTearDown(sub.close);
    final outcome = await c
        .read(subscribeControllerProvider.notifier)
        .completeReturn('cs_unpaid');
    expect(outcome, SubscribeOutcome.pendingConfirmation);
    expect(repo.calls.where((x) => x == 'complete:cs_unpaid'), isNotEmpty);
    expect(c.read(subscribeControllerProvider).busy, isFalse);
  });

  test('client: the return link turns the plan on', () async {
    final repo = _ClientRepo();
    final c = ProviderContainer(
      overrides: [
        clientPlanRepositoryProvider.overrideWithValue(repo),
        checkoutPollIntervalProvider.overrideWithValue(Duration.zero),
      ],
    );
    addTearDown(c.dispose);
    final sub = c.listen(clientCheckoutControllerProvider, (_, __) {});
    addTearDown(sub.close);
    final outcome = await c
        .read(clientCheckoutControllerProvider.notifier)
        .completeReturn('cs_plan_1');
    expect(outcome, ClientCheckoutOutcome.activated);
    expect(repo.ids, ['cs_plan_1', 'cs_plan_1']);
  });
}
