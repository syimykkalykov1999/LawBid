// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_country_partner_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateCountryPartnerDto _$UpdateCountryPartnerDtoFromJson(
  Map<String, dynamic> json,
) => UpdateCountryPartnerDto(
  name: json['name'] as String?,
  contact: json['contact'] as String?,
  maxAdmins: (json['maxAdmins'] as num?)?.toInt(),
  contractStartsAt: json['contractStartsAt'] == null
      ? null
      : DateTime.parse(json['contractStartsAt'] as String),
  contractEndsAt: json['contractEndsAt'] == null
      ? null
      : DateTime.parse(json['contractEndsAt'] as String),
  goals: (json['goals'] as List<dynamic>?)
      ?.map((e) => CountryPartnerGoalDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  note: json['note'] as String?,
);

Map<String, dynamic> _$UpdateCountryPartnerDtoToJson(
  UpdateCountryPartnerDto instance,
) => <String, dynamic>{
  'name': ?instance.name,
  'contact': ?instance.contact,
  'maxAdmins': ?instance.maxAdmins,
  'contractStartsAt': ?instance.contractStartsAt?.toIso8601String(),
  'contractEndsAt': ?instance.contractEndsAt?.toIso8601String(),
  'goals': ?instance.goals?.map((e) => e.toJson()).toList(),
  'note': ?instance.note,
};
