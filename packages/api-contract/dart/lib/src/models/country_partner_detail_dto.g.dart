// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_partner_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryPartnerDetailDto _$CountryPartnerDetailDtoFromJson(
  Map<String, dynamic> json,
) => CountryPartnerDetailDto(
  id: json['id'] as String,
  countryCode: json['countryCode'] as String,
  countryName: json['countryName'] as String,
  name: json['name'] as String,
  contact: json['contact'] as String?,
  leadAdminId: json['leadAdminId'] as String,
  leadEmail: json['leadEmail'] as String,
  sharePercent: json['sharePercent'] as num,
  status: CountryPartnerStatus.fromJson(json['status'] as String),
  maxAdmins: (json['maxAdmins'] as num).toInt(),
  teamSize: (json['teamSize'] as num).toInt(),
  payoutsEnabled: json['payoutsEnabled'] as bool,
  contractStartsAt: json['contractStartsAt'] == null
      ? null
      : DateTime.parse(json['contractStartsAt'] as String),
  contractEndsAt: json['contractEndsAt'] == null
      ? null
      : DateTime.parse(json['contractEndsAt'] as String),
  contractVersion: (json['contractVersion'] as num?)?.toInt(),
  contractAcceptedAt: json['contractAcceptedAt'] == null
      ? null
      : DateTime.parse(json['contractAcceptedAt'] as String),
  note: json['note'] as String?,
  createdAt: DateTime.parse(json['createdAt'] as String),
  goals: (json['goals'] as List<dynamic>)
      .map((e) => CountryPartnerGoalViewDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  team: (json['team'] as List<dynamic>)
      .map(
        (e) => CountryPartnerTeamMemberDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  settlements: (json['settlements'] as List<dynamic>)
      .map(
        (e) => CountryPartnerSettlementDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  currentMonth: (json['currentMonth'] as List<dynamic>)
      .map((e) => CountryPartnerMonthDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$CountryPartnerDetailDtoToJson(
  CountryPartnerDetailDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'countryCode': instance.countryCode,
  'countryName': instance.countryName,
  'name': instance.name,
  'contact': ?instance.contact,
  'leadAdminId': instance.leadAdminId,
  'leadEmail': instance.leadEmail,
  'sharePercent': instance.sharePercent,
  'status': instance.status.toJson(),
  'maxAdmins': instance.maxAdmins,
  'teamSize': instance.teamSize,
  'payoutsEnabled': instance.payoutsEnabled,
  'contractStartsAt': ?instance.contractStartsAt?.toIso8601String(),
  'contractEndsAt': ?instance.contractEndsAt?.toIso8601String(),
  'contractVersion': ?instance.contractVersion,
  'contractAcceptedAt': ?instance.contractAcceptedAt?.toIso8601String(),
  'note': ?instance.note,
  'createdAt': instance.createdAt.toIso8601String(),
  'goals': instance.goals.map((e) => e.toJson()).toList(),
  'team': instance.team.map((e) => e.toJson()).toList(),
  'settlements': instance.settlements.map((e) => e.toJson()).toList(),
  'currentMonth': instance.currentMonth.map((e) => e.toJson()).toList(),
};
