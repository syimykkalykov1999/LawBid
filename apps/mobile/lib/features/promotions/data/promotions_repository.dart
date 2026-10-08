import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-02 — `/promotions/quote`, `/cases/:id/promotion(s)`.
/// Owner 2026-10-05 — `/posts/:id/promotion(s)`, `/me/promotions`,
/// `/promotions/:id/stop|click`.
class PromotionsRepository {
  PromotionsRepository(Dio dio)
      : _api = api.PromotionsClient(dio),
        _billing = api.BillingClient(dio);

  final api.PromotionsClient _api;
  final api.BillingClient _billing;

  Future<PromotionQuote> quote(
    int days, {
    int? dailyBudgetCents,
    PromotionTarget target = PromotionTarget.case_,
    bool video = false,
  }) async =>
      _quote(
        (await guardApiCall(
          () => _api.getPromotionQuote(
            days: days,
            dailyBudgetCents: dailyBudgetCents,
            target: _target(target),
            video: video ? true : null,
          ),
        ))
            .data,
      );

  Future<CasePromotionState> state(
    String id, {
    PromotionTarget target = PromotionTarget.case_,
  }) async {
    final d = (await guardApiCall(
      () => target == PromotionTarget.post
          ? _api.getPostPromotion(id: id)
          : _api.getCasePromotion(id: id),
    ))
        .data;
    return CasePromotionState(
      canPromote: d.canPromote,
      quote: _quote(d.quote),
      promotion: d.promotion == null ? null : _promotion(d.promotion!),
    );
  }

  Future<PromotionPurchase> buy(
    String id, {
    required int days,
    PromotionTarget target = PromotionTarget.case_,
    int? dailyBudgetCents,
    PromotionAudience? audience,
    bool useCredits = true,
    String? promoCode,
    BoostBilling? billing,
  }) async {
    final body = api.CreatePromotionDto(
      billing: billing == null ? null : api.BoostBilling.fromJson(billing.name),
      days: days,
      dailyBudgetCents: dailyBudgetCents,
      audience: audience == null || audience.isAutomatic
          ? null
          : api.PromotionAudienceDto(
              role: switch (audience.role) {
                'attorneys' => api.PromotionAudienceDtoRole.attorneys,
                'clients' => api.PromotionAudienceDtoRole.clients,
                _ => api.PromotionAudienceDtoRole.all,
              },
              states: audience.states,
              countries: audience.countries,
              topics: audience.topics,
            ),
      useCredits: useCredits,
      promoCode: promoCode,
    );
    const extras = {RequestFlags.createsResource: true};
    final d = (await guardApiCall(
      () => target == PromotionTarget.post
          ? _api.createPostPromotion(id: id, body: body, extras: extras)
          : _api.createCasePromotion(id: id, body: body, extras: extras),
    ))
        .data;
    return PromotionPurchase(
      status: PromotionStatus.parse(d.status.json),
      totalCents: d.totalCents,
      creditDaysUsed: d.creditDaysUsedExact,
      checkoutUrl: d.checkoutUrl,
    );
  }

  /// "My promotions" — reach, clicks, progress.
  Future<PromotionPage> mine({String? cursor}) async {
    final r = await guardApiCall(() => _api.listMyPromotions(cursor: cursor));
    return PromotionPage(
      items: [
        for (final d in r.data)
          _fromFields(
            id: d.id,
            target: d.targetType,
            caseId: d.caseId,
            postId: d.postId,
            status: d.status,
            days: d.days,
            priceCentsPerDay: d.priceCentsPerDay,
            totalCents: d.totalCents,
            impressions: d.impressions,
            reach: d.reach,
            clicks: d.clicks,
            targetImpressions: d.targetImpressions,
            cancelReason: d.cancelReason,
            startsAt: d.startsAt,
            endsAt: d.endsAt,
            createdAt: d.createdAt,
            title: d.title,
            billing: d.billing,
            targetUnits: d.targetUnits,
            deliveredUnits: d.deliveredUnits,
            actions: d.actions,
          ),
      ],
      nextCursor: r.meta?.nextCursor,
    );
  }

  /// Stops a running (no refund) or unpaid promotion.
  Future<void> stop(String id) async {
    await guardApiCall(() => _api.stopPromotion(id: id));
  }

  /// A promoted post / case was opened — best effort, never throws.
  Future<void> click(String id) async {
    try {
      await _api.clickPromotion(id: id);
    } on Object {
      // Stats only.
    }
  }

  final _watched = <String>{};

  /// Owner 2026-10-07: a promoted video was watched to the end — counts
  /// once per promotion and person (the server checks too). Best effort.
  Future<void> watched(String id) async {
    if (!_watched.add(id)) return;
    await _action(id, api.PromotionActionDtoKind.watched);
  }

  /// The author's profile was opened from a promoted post. Best effort.
  Future<void> profileOpened(String id) =>
      _action(id, api.PromotionActionDtoKind.profileOpen);

  Future<void> _action(String id, api.PromotionActionDtoKind kind) async {
    try {
      await _api.actionPromotion(
        id: id,
        body: api.PromotionActionDto(kind: kind),
      );
    } on Object {
      // Stats only.
    }
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
        creditDaysAvailable: d.creditDaysAvailableExact,
        creditDaysUsed: d.creditDaysUsedExact,
        maxDays: d.maxDays,
        enabled: d.enabled,
        dailyBudgetCents: d.dailyBudgetCents,
        minDailyBudgetCents: d.minDailyBudgetCents,
        maxDailyBudgetCents: d.maxDailyBudgetCents,
        budgetPresetsCents: d.budgetPresetsCents,
        durationPresets: d.durationPresets,
        estImpressions: d.estImpressions,
        estReachMin: d.estReachMin,
        estReachMax: d.estReachMax,
        offers: [
          for (final o in d.offers)
            if (_boostBilling(o.billing) case final b?)
              BoostOffer(b, o.priceCents),
        ],
        actions: d.actions,
      );

  static BoostBilling? _boostBilling(api.BoostBilling b) =>
      BoostBilling.values.where((x) => x.name == b.json).firstOrNull;

  static api.PromotionTarget _target(PromotionTarget t) =>
      t == PromotionTarget.post
          ? api.PromotionTarget.post
          : api.PromotionTarget.valueCase;

  static CasePromotion _promotion(api.CasePromotionDto d) => _fromFields(
        id: d.id,
        target: d.targetType,
        caseId: d.caseId,
        postId: d.postId,
        status: d.status,
        days: d.days,
        priceCentsPerDay: d.priceCentsPerDay,
        totalCents: d.totalCents,
        impressions: d.impressions,
        reach: d.reach,
        clicks: d.clicks,
        targetImpressions: d.targetImpressions,
        cancelReason: d.cancelReason,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        createdAt: d.createdAt,
        billing: d.billing,
        targetUnits: d.targetUnits,
        deliveredUnits: d.deliveredUnits,
        actions: d.actions,
      );

  static CasePromotion _fromFields({
    required String id,
    required api.PromotionTarget target,
    required String? caseId,
    required String? postId,
    required api.CasePromotionStatus status,
    required int days,
    required int priceCentsPerDay,
    required int totalCents,
    required int impressions,
    required int reach,
    required int clicks,
    required int? targetImpressions,
    required String? cancelReason,
    required DateTime? startsAt,
    required DateTime? endsAt,
    required DateTime createdAt,
    required api.BoostBilling billing,
    required int? targetUnits,
    required int deliveredUnits,
    required int actions,
    String title = '',
  }) =>
      CasePromotion(
        id: id,
        target: PromotionTarget.parse(target.json),
        caseId: caseId,
        postId: postId,
        status: PromotionStatus.parse(status.json),
        days: days,
        priceCentsPerDay: priceCentsPerDay,
        totalCents: totalCents,
        impressions: impressions,
        reach: reach,
        clicks: clicks,
        targetImpressions: targetImpressions,
        cancelReason: cancelReason,
        startsAt: startsAt?.toLocal(),
        endsAt: endsAt?.toLocal(),
        createdAt: createdAt.toLocal(),
        title: title,
        billing: _boostBilling(billing) ?? BoostBilling.impressions,
        targetUnits: targetUnits,
        deliveredUnits: deliveredUnits,
        actions: actions,
      );
}
