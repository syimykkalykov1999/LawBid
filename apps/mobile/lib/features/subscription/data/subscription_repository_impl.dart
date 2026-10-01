import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/subscription/domain/subscription_repository.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// `SubscriptionsClient` of the generated contract → domain models.
class ApiSubscriptionRepository implements SubscriptionRepository {
  ApiSubscriptionRepository(Dio dio) : _api = api.SubscriptionsClient(dio);

  final api.SubscriptionsClient _api;

  static SubscriptionInfo _info(api.SubscriptionDto d) => SubscriptionInfo(
        id: d.id,
        status: SubscriptionStatus.parse(d.status.json),
        isActive: d.isActive,
        priceCents: d.priceCents,
        plan: SubscriptionPlan.parse(d.plan.json),
        assistantSeats: d.assistantSeats,
        trialEndsAt: d.trialEndsAt,
        currentPeriodEnd: d.currentPeriodEnd,
        cancelAtPeriodEnd: d.cancelAtPeriodEnd,
        canceledAt: d.canceledAt,
        graceEndsAt: d.graceEndsAt,
        createdAt: d.createdAt,
      );

  static SubscriptionOverview _overview(api.SubscriptionMeDto d) =>
      SubscriptionOverview(
        subscription: d.subscription == null ? null : _info(d.subscription!),
        isActive: d.isActive,
        canStart: d.canStart,
        trialEligible: d.trialEligible,
        priceCents: d.priceCents,
        prices: PlanPrices(
          monthlyCents: d.prices.monthlyCents,
          seatCents: d.prices.seatCents,
          yearlyCents: d.prices.yearlyCents,
          maxSeats: d.prices.maxSeats,
        ),
      );

  static PaymentRecord _payment(api.PaymentDto p) => PaymentRecord(
        id: p.id,
        amountCents: p.amountCents,
        currency: p.currency,
        status: PaymentStatus.parse(p.status.json),
        paidAt: p.paidAt,
        failureCode: p.failureCode,
        createdAt: p.createdAt,
      );

  @override
  Future<SubscriptionOverview> overview() async =>
      _overview((await guardApiCall(_api.mySubscription)).data);

  @override
  Future<WebCheckout> checkout({
    SubscriptionPlan plan = SubscriptionPlan.monthly,
    int assistantSeats = 0,
    List<String> assistantPhones = const [],
  }) async {
    final d = (await guardApiCall(
      () => _api.createCheckout(
        body: api.CheckoutRequestDto(
          plan: plan == SubscriptionPlan.yearly
              ? api.SubscriptionPlan.yearly
              : api.SubscriptionPlan.monthly,
          assistantSeats: plan == SubscriptionPlan.yearly ? 0 : assistantSeats,
          assistantPhones: assistantPhones.isEmpty ? null : assistantPhones,
        ),
      ),
    ))
        .data;
    final uri = Uri.tryParse(d.url);
    if (uri == null || !uri.hasScheme) {
      throw const ApiException(
        code: ApiException.networkErrorCode,
        message: 'Unexpected checkout URL from the server.',
      );
    }
    return WebCheckout(
      url: uri,
      sessionId: d.sessionId,
      trialEligible: d.trialEligible,
      priceCents: d.priceCents,
      trialDays: d.trialDays,
    );
  }

  @override
  Future<SubscriptionOverview> completeCheckout(String sessionId) async =>
      _overview(
        (await guardApiCall(
          () => _api.completeCheckout(
            body: api.CompleteCheckoutDto(sessionId: sessionId),
          ),
        ))
            .data,
      );

  @override
  Future<SubscriptionOverview> setSeats(int seats) async => _overview(
        (await guardApiCall(
          () => _api.setSeats(body: api.SetSeatsDto(seats: seats)),
        ))
            .data,
      );

  @override
  Future<SubscriptionStart> start() async {
    final d = (await guardApiCall(_api.startSubscription)).data;
    return SubscriptionStart(
      clientSecret: d.clientSecret,
      setupIntentId: d.setupIntentId,
      customerId: d.customerId,
      trialEligible: d.trialEligible,
      priceCents: d.priceCents,
      trialDays: d.trialDays,
    );
  }

  @override
  Future<SubscriptionOverview> confirm(
    String setupIntentId, {
    bool chargeNow = false,
  }) async =>
      _overview(
        (await guardApiCall(
          () => _api.confirmSubscription(
            body: api.ConfirmSubscriptionDto(
              setupIntentId: setupIntentId,
              chargeNow: chargeNow ? true : null,
            ),
          ),
        ))
            .data,
      );

  @override
  Future<CursorPage<PaymentRecord>> payments({String? cursor}) async {
    final env = await guardApiCall(() => _api.myPayments(cursor: cursor));
    return CursorPage(
      items: [for (final p in env.data) _payment(p)],
      nextCursor: env.meta?.nextCursor,
    );
  }

  @override
  Future<Uri> portalUrl() async {
    final env = await guardApiCall(_api.portalSession);
    final uri = Uri.tryParse(env.data.url);
    if (uri == null || !uri.hasScheme) {
      throw const ApiException(
        code: ApiException.networkErrorCode,
        message: 'Unexpected portal URL from the server.',
      );
    }
    return uri;
  }

  @override
  Future<SubscriptionOverview> cancel() async =>
      _overview((await guardApiCall(_api.cancelSubscription)).data);
}
