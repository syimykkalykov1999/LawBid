// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'country_admin_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CountryAdminDto _$CountryAdminDtoFromJson(Map<String, dynamic> json) =>
    CountryAdminDto(
      code: json['code'] as String,
      name: json['name'] as String,
      isEnabled: json['isEnabled'] as bool,
      callingCode: json['callingCode'] as String,
      currency: json['currency'] as String,
      language: json['language'] as String,
      regionKind: json['regionKind'] as String,
      timezone: json['timezone'] as String?,
      stripeSupported: json['stripeSupported'] as bool,
      sort: (json['sort'] as num).toInt(),
      enabledAt: json['enabledAt'] == null
          ? null
          : DateTime.parse(json['enabledAt'] as String),
      regions: (json['regions'] as num).toInt(),
      clients: (json['clients'] as num).toInt(),
      attorneys: (json['attorneys'] as num).toInt(),
      waiting: (json['waiting'] as num).toInt(),
      ready: json['ready'] as bool,
    );

Map<String, dynamic> _$CountryAdminDtoToJson(CountryAdminDto instance) =>
    <String, dynamic>{
      'code': instance.code,
      'name': instance.name,
      'isEnabled': instance.isEnabled,
      'callingCode': instance.callingCode,
      'currency': instance.currency,
      'language': instance.language,
      'regionKind': instance.regionKind,
      'timezone': ?instance.timezone,
      'stripeSupported': instance.stripeSupported,
      'sort': instance.sort,
      'enabledAt': ?instance.enabledAt?.toIso8601String(),
      'regions': instance.regions,
      'clients': instance.clients,
      'attorneys': instance.attorneys,
      'waiting': instance.waiting,
      'ready': instance.ready,
    };
