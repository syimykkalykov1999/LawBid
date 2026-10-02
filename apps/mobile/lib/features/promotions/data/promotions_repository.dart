import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-02 — `/promotions/quote`, `/cases/:id/promotion(s)`.
class PromotionsRepository {
  PromotionsRepository(Dio dio)
      : _api = api.PromotionsClient(dio),
        _billing = api.BillingClient(dio);

  final api.PromotionsClient _api;
  final api.BillingClient _billing;

  Future<PromotionQuote> quote(int days) async => _quote(
        (await guardApiCall(() => _api.getPromotionQuote(days: days))).data,
      );

  Future<CasePromotionState> state(String caseId) async {
    final d =
        (await guardApiCall(() => _api.getCasePromotion(id: caseId))).data;
    return CasePromotionState(
      canPromote: d.canPromote,
      quote: _quote(d.quote),
      promotion: d.promotion == null ? null : _promotion(d.promotion!),
    );
  }

  Future<PromotionPurchase> buy(
    String caseId, {
    required int days,
    bool useCredits = true,
    String? promoCode,
  }) async {
    final d = (await guardApiCall(
      () => _api.createCasePromotion(
        id: caseId,
        body: api.CreatePromotionDto(
          days: days,
          useCredits: useCredits,
          promoCode: promoCode,
        ),
        extras: const {RequestFlags.createsResource: true},
      ),
    ))
        .data;
    return PromotionPurchase(
      status: PromotionStatus.parse(d.status.json),
      totalCents: d.totalCents,
      creditDaysUsed: d.creditDaysUsed,
      checkoutUrl: d.checkoutUrl,
    );
  }

  /// Same check as at the subscription checkout, for `appliesTo: promotion`.
  Future<PromoCheck> validatePromo(String code) async {
    final d = (await guardApiCall(
      () => _billing.validatePromoCode(
        body: api.ValidatePromoDto(
          code: code,
          appliesTo: api.PromoPurchase.promotion,
        ),
      ),
    ))
        .data;
    return PromoCheck(
      valid: d.valid,
      percentOff: d.percentOff,
      amountOffCents: d.amountOffCents,
      freeDays: d.freeDays,
      reason: d.reason?.json,
    );
  }

  static PromotionQuote _quote(api.PromotionQuoteDto d) => PromotionQuote(
        days: d.days,
        priceCentsPerDay: d.priceCentsPerDay,
        grossCents: d.grossCents,
        totalCents: d.totalCents,
        creditDaysAvailable: d.creditDaysAvailable,
        creditDaysUsed: d.creditDaysUsed,
        maxDays: d.maxDays,
        enabled: d.enabled,
      );

  static CasePromotion _promotion(api.CasePromotionDto d) => CasePromotion(
        status: PromotionStatus.parse(d.status.json),
        days: d.days,
        totalCents: d.totalCents,
        impressions: d.impressions,
        startsAt: d.startsAt?.toLocal(),
        endsAt: d.endsAt?.toLocal(),
      );
}
