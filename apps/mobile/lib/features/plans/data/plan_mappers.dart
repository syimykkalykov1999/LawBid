import 'package:lawbid/features/plans/domain/plan_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-05: generated plan DTOs → domain, shared by the attorney
/// subscription and the client plan repositories.
abstract final class PlanMappers {
  static LocalizedText text(api.LocalizedTextDto? d) =>
      d == null ? LocalizedText.empty : LocalizedText(en: d.en, ru: d.ru);

  static PriceDiscount? discount(api.PriceDiscountDto? d) => d == null
      ? null
      : PriceDiscount(compareAtCents: d.compareAtCents, percent: d.percent);

  static PlanEntitlements entitlements(api.PlanEntitlementsDto? d) => d == null
      ? PlanEntitlements.none
      : PlanEntitlements(
          includedSeats: d.includedSeats,
          maxSeats: d.maxSeats,
          extraSeatPriceCents: d.extraSeatPriceCents,
          bidsAnyState: d.bidsAnyState,
          maxActiveBids: d.maxActiveBids,
          prioritySearch: d.prioritySearch,
          calls: d.calls,
          videoCalls: d.videoCalls,
          documentTemplates: d.documentTemplates,
          chatTranslate: d.chatTranslate,
          translationsPerDay: d.translationsPerDay,
          videoPosts: d.videoPosts,
          postsPerDay: d.postsPerDay,
          videosPerDay: d.videosPerDay,
          casePromotion: d.casePromotion,
          trialDays: d.trialDays,
          verifiedBadge: d.verifiedBadge,
          priorityFeed: d.priorityFeed,
          maxActiveCases: d.maxActiveCases,
        );

  static PlanOffer plan(api.PublicPlanDto d) => PlanOffer(
        id: d.id,
        code: d.code,
        audience: PlanAudience.parse(d.audience.json),
        isBaseline: d.kind == api.PublicPlanDtoKind.baseline,
        name: text(d.name),
        tagline: text(d.tagline),
        description: text(d.description),
        interval: PlanInterval.parse(d.interval?.json),
        currency: d.currency,
        amountCents: d.amountCents,
        extraSeatCents: d.extraSeatCents,
        discount: discount(d.discount),
        entitlements: entitlements(d.entitlements),
        highlights: [for (final h in d.highlights) text(h)],
        isDefault: d.isDefault,
        trialDays: d.trialDays,
      );

  static List<PlanOffer> plans(List<api.PublicPlanDto>? list) =>
      [for (final p in list ?? const <api.PublicPlanDto>[]) plan(p)];

  static SeatSummary? seats(api.SeatSummaryDto? d) => d == null
      ? null
      : SeatSummary(
          included: d.included,
          extra: d.extra,
          total: d.total,
          max: d.max,
        );
}
