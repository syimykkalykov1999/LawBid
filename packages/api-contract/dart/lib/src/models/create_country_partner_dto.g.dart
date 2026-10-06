// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_country_partner_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateCountryPartnerDto _$CreateCountryPartnerDtoFromJson(
  Map<String, dynamic> json,
) => CreateCountryPartnerDto(
  countryCode: json['countryCode'] as String,
  name: json['name'] as String,
  email: json['email'] as String,
  sharePercent: json['sharePercent'] as num,
  contact: json['contact'] as String?,
  login: json['login'] as String?,
  password: json['password'] as String?,
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

Map<String, dynamic> _$CreateCountryPartnerDtoToJson(
  CreateCountryPartnerDto instance,
) => <String, dynamic>{
  'countryCode': instance.countryCode,
  'name': instance.name,
  'contact': ?instance.contact,
  'email': instance.email,
  'login': ?instance.login,
  'password': ?instance.password,
  'sharePercent': instance.sharePercent,
  'maxAdmins': ?instance.maxAdmins,
  'contractStartsAt': ?instance.contractStartsAt?.toIso8601String(),
  'contractEndsAt': ?instance.contractEndsAt?.toIso8601String(),
  'goals': ?instance.goals?.map((e) => e.toJson()).toList(),
  'note': ?instance.note,
};
