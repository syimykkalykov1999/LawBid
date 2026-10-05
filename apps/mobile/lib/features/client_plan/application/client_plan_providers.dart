import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/client_plan/data/client_plan_repository.dart';
import 'package:lawbid/features/client_plan/domain/client_plan_models.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';

Duration? _noRetry(int retryCount, Object error) => null;

final clientPlanRepositoryProvider = Provider<ClientPlanRepository>(
  (ref) => ApiClientPlanRepository(ref.watch(dioProvider)),
);

/// `GET /client-plans/me` behind Settings → «Подписка клиента».
final clientPlanProvider =
    AsyncNotifierProvider.autoDispose<ClientPlanController, ClientPlanOverview>(
  ClientPlanController.new,
  retry: _noRetry,
);

class ClientPlanController extends AsyncNotifier<ClientPlanOverview> {
  @override
  Future<ClientPlanOverview> build() =>
      ref.watch(clientPlanRepositoryProvider).me();

  /// Reloads; with data on screen a failure keeps it and rethrows.
  Future<void> refresh() async {
    final repo = ref.read(clientPlanRepositoryProvider);
    if (state.value == null) {
      state = const AsyncLoading();
      final next = await AsyncValue.guard(repo.me);
      if (ref.mounted) state = next;
      return;
    }
    final next = await repo.me();
    if (ref.mounted) state = AsyncData(next);
  }

  void apply(ClientPlanOverview overview) {
    if (ref.mounted) state = AsyncData(overview);
  }

  Future<ClientPlanOverview> cancel() async {
    final next = await ref.read(clientPlanRepositoryProvider).cancel();
    apply(next);
    return next;
  }

  Future<ClientPlanOverview> resume() async {
    final next = await ref.read(clientPlanRepositoryProvider).resume();
    apply(next);
    return next;
  }
}

enum ClientCheckoutPhase { idle, starting, awaitingPayment }

/// How one run of [ClientCheckoutController.subscribe] ended.
enum ClientCheckoutOutcome { trialStarted, activated, cancelled, failed }

@immutable
class ClientCheckoutState {
  const ClientCheckoutState._(this.phase, this.error);

  const ClientCheckoutState.idle() : this._(ClientCheckoutPhase.idle, null);

  const ClientCheckoutState.failed(Object error)
      : this._(ClientCheckoutPhase.idle, error);

  final ClientCheckoutPhase phase;

  /// The error of the last failed run; cleared when a new run starts.
  final Object? error;

  bool get busy => phase != ClientCheckoutPhase.idle;
}

/// Mirrors the attorney's `subscribeWeb`: open Stripe's page in the
/// browser, then poll `checkout/complete` with the session id until the
/// subscription is active (15 min max; the client may stop waiting).
final clientCheckoutControllerProvider =
    NotifierProvider.autoDispose<ClientCheckoutController, ClientCheckoutState>(
  ClientCheckoutController.new,
);

class ClientCheckoutController extends Notifier<ClientCheckoutState> {
  @override
  ClientCheckoutState build() => const ClientCheckoutState.idle();

  String? _sessionId;
  bool _stopWaiting = false;

  void _phase(ClientCheckoutPhase phase) {
    if (ref.mounted) state = ClientCheckoutState._(phase, null);
  }

  Future<ClientCheckoutOutcome> subscribe({String? planCode}) async {
    if (state.busy) return ClientCheckoutOutcome.cancelled;
    final repo = ref.read(clientPlanRepositoryProvider);
    try {
      _phase(ClientCheckoutPhase.starting);
      final checkout = await repo.checkout(planCode: planCode);
      _sessionId = checkout.sessionId;
      _stopWaiting = false;
      // Only https in production; the dev payment page is http://localhost.
      final okScheme = checkout.url.scheme == 'https' ||
          (kDebugMode && checkout.url.scheme == 'http');
      if (!okScheme ||
          !await ref.read(checkoutLauncherProvider)(checkout.url)) {
        throw const CheckoutNotOpened();
      }
      _phase(ClientCheckoutPhase.awaitingPayment);
      final interval = ref.read(checkoutPollIntervalProvider);
      final deadline = DateTime.now().add(const Duration(minutes: 15));
      while (
          ref.mounted && !_stopWaiting && DateTime.now().isBefore(deadline)) {
        final overview = await _check(repo);
        if (overview != null && overview.isActive) {
          if (!ref.mounted) return ClientCheckoutOutcome.activated;
          ref.read(clientPlanProvider.notifier).apply(overview);
          _phase(ClientCheckoutPhase.idle);
          return (overview.subscription?.inTrial ?? false)
              ? ClientCheckoutOutcome.trialStarted
              : ClientCheckoutOutcome.activated;
        }
        await Future<void>.delayed(interval);
      }
      _phase(ClientCheckoutPhase.idle);
      return ClientCheckoutOutcome.cancelled;
    } on Object catch (e) {
      if (ref.mounted) state = ClientCheckoutState.failed(e);
      return ClientCheckoutOutcome.failed;
    }
  }

  /// "I closed the page": stop waiting (a later payment still lands by
  /// webhook and shows on the next refresh).
  void stopWaiting() => _stopWaiting = true;

  /// Back in the app: one more check of the open session.
  Future<void> checkNow() async {
    final overview = await _check(ref.read(clientPlanRepositoryProvider));
    if (overview != null && ref.mounted) {
      ref.read(clientPlanProvider.notifier).apply(overview);
    }
  }

  Future<ClientPlanOverview?> _check(ClientPlanRepository repo) async {
    final id = _sessionId;
    if (id == null) return null;
    try {
      return await repo.completeCheckout(id);
    } on Object {
      return null; // offline for a moment: keep waiting
    }
  }
}
