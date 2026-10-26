// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_partner_stats_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachPartnerStatsDto _$OutreachPartnerStatsDtoFromJson(
  Map<String, dynamic> json,
) => OutreachPartnerStatsDto(
  partner: json['partner'] == null
      ? null
      : OutreachPartnerDto.fromJson(json['partner'] as Map<String, dynamic>),
  leads: json['leads'] as num,
  calls: json['calls'] as num,
  emails: json['emails'] as num,
  replied: json['replied'] as num,
  registered: json['registered'] as num,
  paid: json['paid'] as num,
  commissionCents: json['commissionCents'] as num,
  lastActivityAt: json['lastActivityAt'] == null
      ? null
      : DateTime.parse(json['lastActivityAt'] as String),
);

Map<String, dynamic> _$OutreachPartnerStatsDtoToJson(
  OutreachPartnerStatsDto instance,
) => <String, dynamic>{
  'partner': ?instance.partner?.toJson(),
  'leads': instance.leads,
  'calls': instance.calls,
  'emails': instance.emails,
  'replied': instance.replied,
  'registered': instance.registered,
  'paid': instance.paid,
  'commissionCents': instance.commissionCents,
  'lastActivityAt': ?instance.lastActivityAt?.toIso8601String(),
};
