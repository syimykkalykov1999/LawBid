// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'plan_entitlements_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PlanEntitlementsDto _$PlanEntitlementsDtoFromJson(Map<String, dynamic> json) =>
    PlanEntitlementsDto(
      includedSeats: (json['included_seats'] as num?)?.toInt(),
      maxSeats: (json['max_seats'] as num?)?.toInt(),
      extraSeatPriceCents: (json['extra_seat_price_cents'] as num?)?.toInt(),
      bidsAnyState: json['bids_any_state'] as bool?,
      maxActiveBids: (json['max_active_bids'] as num?)?.toInt(),
      prioritySearch: json['priority_search'] as bool?,
      calls: json['calls'] as bool?,
      videoCalls: json['video_calls'] as bool?,
      documentTemplates: json['document_templates'] as bool?,
      chatTranslate: json['chat_translate'] as bool?,
      translationsPerDay: (json['translations_per_day'] as num?)?.toInt(),
      videoPosts: json['video_posts'] as bool?,
      postsPerDay: (json['posts_per_day'] as num?)?.toInt(),
      videosPerDay: (json['videos_per_day'] as num?)?.toInt(),
      casePromotion: json['case_promotion'] as bool?,
      platformPayments: json['platform_payments'] as bool?,
      trialDays: (json['trial_days'] as num?)?.toInt(),
      verifiedBadge: json['verified_badge'] as bool?,
      priorityFeed: json['priority_feed'] as bool?,
      maxActiveCases: (json['max_active_cases'] as num?)?.toInt(),
    );

Map<String, dynamic> _$PlanEntitlementsDtoToJson(
  PlanEntitlementsDto instance,
) => <String, dynamic>{
  'included_seats': ?instance.includedSeats,
  'max_seats': ?instance.maxSeats,
  'extra_seat_price_cents': ?instance.extraSeatPriceCents,
  'bids_any_state': ?instance.bidsAnyState,
  'max_active_bids': ?instance.maxActiveBids,
  'priority_search': ?instance.prioritySearch,
  'calls': ?instance.calls,
  'video_calls': ?instance.videoCalls,
  'document_templates': ?instance.documentTemplates,
  'chat_translate': ?instance.chatTranslate,
  'translations_per_day': ?instance.translationsPerDay,
  'video_posts': ?instance.videoPosts,
  'posts_per_day': ?instance.postsPerDay,
  'videos_per_day': ?instance.videosPerDay,
  'case_promotion': ?instance.casePromotion,
  'platform_payments': ?instance.platformPayments,
  'trial_days': ?instance.trialDays,
  'verified_badge': ?instance.verifiedBadge,
  'priority_feed': ?instance.priorityFeed,
  'max_active_cases': ?instance.maxActiveCases,
};
