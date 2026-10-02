// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_referral_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminReferralStatsDto _$AdminReferralStatsDtoFromJson(
  Map<String, dynamic> json,
) => AdminReferralStatsDto(
  total: (json['total'] as num).toInt(),
  byStatus: (json['byStatus'] as List<dynamic>)
      .map((e) => ReferralCountDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  byRole: (json['byRole'] as List<dynamic>)
      .map((e) => ReferralCountDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  balanceCentsIssued: (json['balanceCentsIssued'] as num).toInt(),
  promotionDaysIssued: (json['promotionDaysIssued'] as num).toInt(),
  promotionDaysUsed: (json['promotionDaysUsed'] as num).toInt(),
);

Map<String, dynamic> _$AdminReferralStatsDtoToJson(
  AdminReferralStatsDto instance,
) => <String, dynamic>{
  'total': instance.total,
  'byStatus': instance.byStatus.map((e) => e.toJson()).toList(),
  'byRole': instance.byRole.map((e) => e.toJson()).toList(),
  'balanceCentsIssued': instance.balanceCentsIssued,
  'promotionDaysIssued': instance.promotionDaysIssued,
  'promotionDaysUsed': instance.promotionDaysUsed,
};
