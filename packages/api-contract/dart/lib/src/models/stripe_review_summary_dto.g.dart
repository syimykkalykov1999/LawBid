// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'stripe_review_summary_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StripeReviewSummaryDto _$StripeReviewSummaryDtoFromJson(
  Map<String, dynamic> json,
) => StripeReviewSummaryDto(
  open: (json['open'] as num).toInt(),
  overdue: (json['overdue'] as num).toInt(),
  byKind: Map<String, int>.from(json['byKind'] as Map),
  disputes30d: (json['disputes30d'] as num).toInt(),
  payments30d: (json['payments30d'] as num).toInt(),
  disputeRatePercent: json['disputeRatePercent'] as num,
  disputeRateLevel: StripeReviewSummaryDtoDisputeRateLevel.fromJson(
    json['disputeRateLevel'] as String,
  ),
);

Map<String, dynamic> _$StripeReviewSummaryDtoToJson(
  StripeReviewSummaryDto instance,
) => <String, dynamic>{
  'open': instance.open,
  'overdue': instance.overdue,
  'byKind': instance.byKind,
  'disputes30d': instance.disputes30d,
  'payments30d': instance.payments30d,
  'disputeRatePercent': instance.disputeRatePercent,
  'disputeRateLevel': instance.disputeRateLevel.toJson(),
};
