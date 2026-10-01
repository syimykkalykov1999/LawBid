import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/config/app_config.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/cases/application/paged_notifier.dart';
import 'package:lawbid/features/subscription/data/card_collector.dart';
import 'package:lawbid/features/subscription/data/subscription_repository_impl.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/domain/subscription_repository.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:url_launcher/url_launcher.dart';

Duration? _noRetry(int retryCount, Object error) => null;

final subscriptionRepositoryProvider = Provider<SubscriptionRepository>(
  (ref) => ApiSubscriptionRepository(ref.watch(dioProvider)),
);

final cardCollectorProvider = Provider<CardCollector>(
  (ref) => StripeCardCollector(publishableKey: AppConfig.stripePublishableKey),
);

/// How often `GET /subscriptions/me` is re-read while the subscription is
/// `incomplete` after confirm (docs/06 §1.4 step 4); tests shorten it.
final subscriptionPollIntervalProvider =
    Provider<Duration>((ref) => const Duration(seconds: 2));

/// `GET /subscriptions/me` behind the "Подписка" screen.
final subscriptionOverviewProvider = AsyncNotifierProvider.autoDispose<
    SubscriptionOverviewController, SubscriptionOverview>(
  SubscriptionOverviewController.new,
  // A failure shows the error/offline state with Retry (docs/01 §8.3).
  retry: _noRetry,
);

class SubscriptionOverviewController
    extends AsyncNotifier<SubscriptionOverview> {
  @override
  Future<SubscriptionOverview> build() =>
      ref.watch(subscriptionRepositoryProvider).overview();

  /// Reloads; with data on screen a failure keeps it and rethrows.
  Future<void> refresh() async {
    final repo = ref.read(subscriptionRepositoryProvider);
    if (state.value == null) {
      state = const AsyncLoading();
      final next = await AsyncValue.guard(repo.overview);
      if (ref.mounted) state = next;
      return;
    }
    final next = await repo.overview();
    if (ref.mounted) state = AsyncData(next);
  }

  void apply(SubscriptionOverview overview) {
    if (ref.mounted) state = AsyncData(overview);
  }

  /// `POST /subscriptions/cancel`: access stays until the period end.
  Future<SubscriptionOverview> cancel() async {
    final next = await ref.read(subscriptionRepositoryProvider).cancel();
    apply(next);
    return next;
  }

  /// `POST /subscriptions/resume`: the cancel is taken back.
  Future<SubscriptionOverview> resume() async {
    final next = await ref.read(subscriptionRepositoryProvider).resume();
    apply(next);
    return next;
  }
}

/// `GET /subscriptions/payments` (docs/06 §1.7 п.4), cursor-paged.
final paymentsProvider = AsyncNotifierProvider.autoDispose<PaymentsNotifier,
    PaginatedList<PaymentRecord>>(
  PaymentsNotifier.new,
  retry: _noRetry,
);

class PaymentsNotifier extends PagedNotifier<PaymentRecord> {
  @override
  Future<CursorPage<PaymentRecord>> fetch(String? cursor) =>
      ref.read(subscriptionRepositoryProvider).payments(cursor: cursor);

  @override
  Object idOf(PaymentRecord item) => item.id;
}

enum SubscribePhase {
  idle,
  starting,
  collectingCard,
  confirming,
  syncing,

  /// OQ-048: the Stripe page is open in the browser; the app checks the
  /// session until it is paid (or the attorney stops waiting).
  awaitingPayment,
}

/// Opens the hosted payment page; tests replace it.
typedef CheckoutLauncher = Future<bool> Function(Uri url);

final checkoutLauncherProvider = Provider<CheckoutLauncher>(
  (ref) => (url) => launchUrl(url, mode: LaunchMode.inAppBrowserView),
);

/// How often the open checkout session is checked; tests shorten it.
final checkoutPollIntervalProvider =
    Provider<Duration>((ref) => const Duration(seconds: 3));

/// The browser could not open the payment page.
class CheckoutNotOpened implements Exception {
  const CheckoutNotOpened();
}

/// How one run of [SubscribeController.subscribe] ended.
enum SubscribeOutcome {
  trialStarted,
  activated,

  /// Confirm returned `incomplete` and the webhook had not landed within
  /// the polling window: the screen shows "статус обновится" + Refresh.
  pendingConfirmation,

  /// The attorney closed the card sheet or declined the immediate charge.
  cancelled,
  failed,
}

@immutable
class SubscribeState {
  const SubscribeState._(this.phase, this.error);

  const SubscribeState.idle() : this._(SubscribePhase.idle, null);

  const SubscribeState.failed(Object error)
      : this._(SubscribePhase.idle, error);

  final SubscribePhase phase;

  /// The error of the last failed run; cleared when a new run starts.
  final Object? error;

  bool get busy => phase != SubscribePhase.idle;
}

/// docs/06 §1.4 "Старт триала": start → card sheet → confirm → poll until
/// the status settles. One state machine for the trial and the no-trial
/// ("будет списано $399 сейчас") paths.
final subscribeControllerProvider =
    NotifierProvider.autoDispose<SubscribeController, SubscribeState>(
  SubscribeController.new,
);

class SubscribeController extends Notifier<SubscribeState> {
  static const _maxPolls = 15;

  @override
  SubscribeState build() => const SubscribeState.idle();

  void _phase(SubscribePhase phase) {
    if (ref.mounted) state = SubscribeState._(phase, null);
  }

  /// [confirmChargeNow] asks the explicit consent of docs/06 §1.1 when no
  /// trial is available (known before the card from `start`, or only
  /// after it when this card already had a trial); [buildRequest] supplies
  /// the sheet's theme colors from the calling screen.
  Future<SubscribeOutcome> subscribe({
    required Future<bool> Function(int chargeNowCents) confirmChargeNow,
    required CardCollectionRequest Function(SubscriptionStart start)
        buildRequest,
  }) async {
    if (state.busy) return SubscribeOutcome.cancelled;
    final repo = ref.read(subscriptionRepositoryProvider);
    final collector = ref.read(cardCollectorProvider);
    try {
      _phase(SubscribePhase.starting);
      final start = await repo.start();
      var chargeNow = false;
      if (!start.trialEligible) {
        if (!await confirmChargeNow(start.priceCents)) {
          _phase(SubscribePhase.idle);
          return SubscribeOutcome.cancelled;
        }
        chargeNow = true;
      }

      _phase(SubscribePhase.collectingCard);
      await collector.collect(buildRequest(start));

      _phase(SubscribePhase.confirming);
      SubscriptionOverview overview;
      try {
        overview =
            await repo.confirm(start.setupIntentId, chargeNow: chargeNow);
      } on ApiException catch (e) {
        if (e.code != ApiErrorCodes.subscriptionTrialUnavailable) rethrow;
        final cents = e.details?['chargeNowCents'];
        if (!await confirmChargeNow(
          cents is num ? cents.toInt() : start.priceCents,
        )) {
          _phase(SubscribePhase.idle);
          return SubscribeOutcome.cancelled;
        }
        _phase(SubscribePhase.confirming);
        overview = await repo.confirm(start.setupIntentId, chargeNow: true);
      }

      overview = await _settle(repo, overview);
      // The screen may be gone by now (autoDispose): the server has the
      // result, nothing to show here.
      if (!ref.mounted) return SubscribeOutcome.pendingConfirmation;
      ref.read(subscriptionOverviewProvider.notifier).apply(overview);
      _phase(SubscribePhase.idle);
      final s = overview.subscription;
      if (s == null || s.pendingConfirmation) {
        return SubscribeOutcome.pendingConfirmation;
      }
      return s.inTrial
          ? SubscribeOutcome.trialStarted
          : SubscribeOutcome.activated;
    } on CardCollectionCancelled {
      _phase(SubscribePhase.idle);
      return SubscribeOutcome.cancelled;
    } on Object catch (e) {
      if (ref.mounted) state = SubscribeState.failed(e);
      return SubscribeOutcome.failed;
    }
  }

  String? _sessionId;
  bool _stopWaiting = false;

  /// OQ-048 (owner 2026-09-30): pay on Stripe's hosted page in the
  /// browser — plan, seats and assistant phones are fixed in the session.
  /// Waits (polling the session, 15 min max) until it is paid; the
  /// attorney may stop waiting and come back later — [checkNow] on resume.
  Future<SubscribeOutcome> subscribeWeb({
    required SubscriptionPlan plan,
    int assistantSeats = 0,
    List<String> assistantPhones = const [],
  }) async {
    if (state.busy) return SubscribeOutcome.cancelled;
    final repo = ref.read(subscriptionRepositoryProvider);
    try {
      _phase(SubscribePhase.starting);
      final checkout = await repo.checkout(
        plan: plan,
        assistantSeats: assistantSeats,
        assistantPhones: assistantPhones,
      );
      _sessionId = checkout.sessionId;
      _stopWaiting = false;
      // Only https in production; the dev payment page is http://localhost.
      final okScheme = checkout.url.scheme == 'https' ||
          (kDebugMode && checkout.url.scheme == 'http');
      if (!okScheme ||
          !await ref.read(checkoutLauncherProvider)(checkout.url)) {
        throw const CheckoutNotOpened();
      }
      _phase(SubscribePhase.awaitingPayment);
      final interval = ref.read(checkoutPollIntervalProvider);
      final deadline = DateTime.now().add(const Duration(minutes: 15));
      while (
          ref.mounted && !_stopWaiting && DateTime.now().isBefore(deadline)) {
        final overview = await _check(repo);
        if (overview != null && overview.isActive) {
          if (!ref.mounted) return SubscribeOutcome.activated;
          ref.read(subscriptionOverviewProvider.notifier).apply(overview);
          _phase(SubscribePhase.idle);
          return (overview.subscription?.inTrial ?? false)
              ? SubscribeOutcome.trialStarted
              : SubscribeOutcome.activated;
        }
        await Future<void>.delayed(interval);
      }
      _phase(SubscribePhase.idle);
      return SubscribeOutcome.cancelled;
    } on Object catch (e) {
      if (ref.mounted) state = SubscribeState.failed(e);
      return SubscribeOutcome.failed;
    }
  }

  /// "I closed the page": stop waiting (a later payment still lands by
  /// webhook and shows on the next refresh).
  void stopWaiting() => _stopWaiting = true;

  Future<SubscriptionOverview?> _check(SubscriptionRepository repo) async {
    final id = _sessionId;
    if (id == null) return null;
    try {
      return await repo.completeCheckout(id);
    } on Object {
      return null; // offline for a moment: keep waiting
    }
  }

  /// The final state comes by webhook (docs/06 §1.4 step 4): re-read
  /// `/subscriptions/me` while it is still `incomplete`, for a bounded
  /// time. Going offline mid-way keeps the last answer.
  Future<SubscriptionOverview> _settle(
    SubscriptionRepository repo,
    SubscriptionOverview first,
  ) async {
    final interval = ref.read(subscriptionPollIntervalProvider);
    var current = first;
    for (var i = 0;
        i < _maxPolls && (current.subscription?.pendingConfirmation ?? false);
        i++) {
      _phase(SubscribePhase.syncing);
      await Future<void>.delayed(interval);
      if (!ref.mounted) break;
      try {
        current = await repo.overview();
      } on Object {
        break;
      }
    }
    return current;
  }
}
