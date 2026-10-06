// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_partner_portal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryPartnerPortalDto _$CountryPartnerPortalDtoFromJson(
  Map<String, dynamic> json,
) => CountryPartnerPortalDto(
  id: json['id'] as String,
  countryCode: json['countryCode'] as String,
  countryName: json['countryName'] as String,
  name: json['name'] as String,
  status: CountryPartnerStatus.fromJson(json['status'] as String),
  lead: json['lead'] as bool,
  sharePercent: json['sharePercent'] as num,
  maxAdmins: (json['maxAdmins'] as num).toInt(),
  teamSize: (json['teamSize'] as num).toInt(),
  payoutsEnabled: json['payoutsEnabled'] as bool,
  contractEndsAt: json['contractEndsAt'] == null
      ? null
      : DateTime.parse(json['contractEndsAt'] as String),
  contractPending: json['contractPending'] as bool,
  contract: CountryPartnerContractDto.fromJson(
    json['contract'] as Map<String, dynamic>,
  ),
  goals: (json['goals'] as List<dynamic>)
      .map((e) => CountryPartnerGoalViewDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  canSeeReport: json['canSeeReport'] as bool,
  settlements: (json['settlements'] as List<dynamic>)
      .map(
        (e) => CountryPartnerSettlementDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  currentMonth: (json['currentMonth'] as List<dynamic>)
      .map((e) => CountryPartnerMonthDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$CountryPartnerPortalDtoToJson(
  CountryPartnerPortalDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'countryCode': instance.countryCode,
  'countryName': instance.countryName,
  'name': instance.name,
  'status': instance.status.toJson(),
  'lead': instance.lead,
  'sharePercent': instance.sharePercent,
  'maxAdmins': instance.maxAdmins,
  'teamSize': instance.teamSize,
  'payoutsEnabled': instance.payoutsEnabled,
  'contractEndsAt': ?instance.contractEndsAt?.toIso8601String(),
  'contractPending': instance.contractPending,
  'contract': instance.contract.toJson(),
  'goals': instance.goals.map((e) => e.toJson()).toList(),
  'canSeeReport': instance.canSeeReport,
  'settlements': instance.settlements.map((e) => e.toJson()).toList(),
  'currentMonth': instance.currentMonth.map((e) => e.toJson()).toList(),
};
