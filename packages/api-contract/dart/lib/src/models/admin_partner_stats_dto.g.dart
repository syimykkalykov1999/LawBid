// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_partner_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPartnerStatsDto _$AdminPartnerStatsDtoFromJson(
  Map<String, dynamic> json,
) => AdminPartnerStatsDto(
  partners: (json['partners'] as num).toInt(),
  active: (json['active'] as num).toInt(),
  pending: (json['pending'] as num).toInt(),
  referredCount: (json['referredCount'] as num).toInt(),
  heldCents: (json['heldCents'] as num).toInt(),
  approvedCents: (json['approvedCents'] as num).toInt(),
  paidCents: (json['paidCents'] as num).toInt(),
  thisMonthCents: (json['thisMonthCents'] as num).toInt(),
);

Map<String, dynamic> _$AdminPartnerStatsDtoToJson(
  AdminPartnerStatsDto instance,
) => <String, dynamic>{
  'partners': instance.partners,
  'active': instance.active,
  'pending': instance.pending,
  'referredCount': instance.referredCount,
  'heldCents': instance.heldCents,
  'approvedCents': instance.approvedCents,
  'paidCents': instance.paidCents,
  'thisMonthCents': instance.thisMonthCents,
};
