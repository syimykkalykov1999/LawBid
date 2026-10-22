import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/client_plan/application/client_plan_providers.dart';
import 'package:lawbid/features/client_plan/data/client_plan_repository.dart';
import 'package:lawbid/features/client_plan/domain/client_plan_models.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';

/// Owner 2026-10-22 («лечи всё»): a client's plan is bought on our card page
/// (not Stripe's hosted page) — the app opens it with its look (theme,
/// language, «back to the app») and waits until the plan is on.
class _Repo implements ClientPlanRepository {
  int checks = 0;

  @override
  Future<ClientPlanCheckout> checkout({String? planCode}) async =>
      ClientPlanCheckout(
        url: Uri.parse('https://lawbid.dev/pay.html#t=plan.tok&api=x'),
        sessionId: 'own:abc',
        priceCents: 999,
        trialDays: 7,
      );

  @override
  Future<ClientPlanOverview> completeCheckout(String sessionId) async {
    checks++;
    return ClientPlanOverview(isActive: checks > 1, trialEligible: false);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test('the plan opens our card page with the app look, then turns on',
      () async {
    final opened = <Uri>[];
    final repo = _Repo();
    final c = ProviderContainer(
      overrides: [
        clientPlanRepositoryProvider.overrideWithValue(repo),
        checkoutLauncherProvider.overrideWithValue((url) async {
          opened.add(url);
          return true;
        }),
        checkoutPollIntervalProvider.overrideWithValue(Duration.zero),
      ],
    );
    addTearDown(c.dispose);
    final sub = c.listen(clientCheckoutControllerProvider, (_, __) {});
    addTearDown(sub.close);
    final outcome = await c
        .read(clientCheckoutControllerProvider.notifier)
        .subscribe(planCode: 'client_pro');
    expect(opened, hasLength(1));
    expect(opened.single.path, '/pay.html');
    expect(opened.single.fragment, startsWith('t=plan.tok&api=x'));
    expect(opened.single.fragment, contains('native=1'));
    expect(outcome, ClientCheckoutOutcome.activated);
  });
}
