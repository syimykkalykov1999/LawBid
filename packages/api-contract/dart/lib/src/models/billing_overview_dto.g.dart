// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'billing_overview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BillingOverviewDto _$BillingOverviewDtoFromJson(Map<String, dynamic> json) =>
    BillingOverviewDto(
      mrrCents: (json['mrrCents'] as num).toInt(),
      subscriptions: BillingSubscriptionCountsDto.fromJson(
        json['subscriptions'] as Map<String, dynamic>,
      ),
      contractGrantsActive: (json['contractGrantsActive'] as num).toInt(),
      revenue30dCents: (json['revenue30dCents'] as num).toInt(),
      grossRevenue30dCents: (json['grossRevenue30dCents'] as num).toInt(),
      refunds30dCents: (json['refunds30dCents'] as num).toInt(),
      refunds30dCount: (json['refunds30dCount'] as num).toInt(),
      promoRedemptions30d: (json['promoRedemptions30d'] as num).toInt(),
      generatedAt: DateTime.parse(json['generatedAt'] as String),
    );

Map<String, dynamic> _$BillingOverviewDtoToJson(BillingOverviewDto instance) =>
    <String, dynamic>{
      'mrrCents': instance.mrrCents,
      'subscriptions': instance.subscriptions.toJson(),
      'contractGrantsActive': instance.contractGrantsActive,
      'revenue30dCents': instance.revenue30dCents,
      'grossRevenue30dCents': instance.grossRevenue30dCents,
      'refunds30dCents': instance.refunds30dCents,
      'refunds30dCount': instance.refunds30dCount,
      'promoRedemptions30d': instance.promoRedemptions30d,
      'generatedAt': instance.generatedAt.toIso8601String(),
    };
