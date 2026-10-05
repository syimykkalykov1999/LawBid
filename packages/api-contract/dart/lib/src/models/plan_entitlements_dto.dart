// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'plan_entitlements_dto.g.dart';

@JsonSerializable()
class PlanEntitlementsDto {
  const PlanEntitlementsDto({
    this.includedSeats,
    this.maxSeats,
    this.extraSeatPriceCents,
    this.bidsAnyState,
    this.maxActiveBids,
    this.prioritySearch,
    this.calls,
    this.videoCalls,
    this.documentTemplates,
    this.chatTranslate,
    this.translationsPerDay,
    this.videoPosts,
    this.postsPerDay,
    this.videosPerDay,
    this.casePromotion,
    this.platformPayments,
    this.trialDays,
    this.verifiedBadge,
    this.priorityFeed,
    this.maxActiveCases,
  });

  factory PlanEntitlementsDto.fromJson(Map<String, Object?> json) =>
      _$PlanEntitlementsDtoFromJson(json);

  @JsonKey(name: 'included_seats')
  final int? includedSeats;
  @JsonKey(name: 'max_seats')
  final int? maxSeats;
  @JsonKey(name: 'extra_seat_price_cents')
  final int? extraSeatPriceCents;
  @JsonKey(name: 'bids_any_state')
  final bool? bidsAnyState;
  @JsonKey(name: 'max_active_bids')
  final int? maxActiveBids;
  @JsonKey(name: 'priority_search')
  final bool? prioritySearch;
  final bool? calls;
  @JsonKey(name: 'video_calls')
  final bool? videoCalls;
  @JsonKey(name: 'document_templates')
  final bool? documentTemplates;
  @JsonKey(name: 'chat_translate')
  final bool? chatTranslate;
  @JsonKey(name: 'translations_per_day')
  final int? translationsPerDay;
  @JsonKey(name: 'video_posts')
  final bool? videoPosts;
  @JsonKey(name: 'posts_per_day')
  final int? postsPerDay;
  @JsonKey(name: 'videos_per_day')
  final int? videosPerDay;
  @JsonKey(name: 'case_promotion')
  final bool? casePromotion;
  @JsonKey(name: 'platform_payments')
  final bool? platformPayments;
  @JsonKey(name: 'trial_days')
  final int? trialDays;
  @JsonKey(name: 'verified_badge')
  final bool? verifiedBadge;
  @JsonKey(name: 'priority_feed')
  final bool? priorityFeed;
  @JsonKey(name: 'max_active_cases')
  final int? maxActiveCases;

  Map<String, Object?> toJson() => _$PlanEntitlementsDtoToJson(this);
}
