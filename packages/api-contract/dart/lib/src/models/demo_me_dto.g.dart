// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'demo_me_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DemoMeDto _$DemoMeDtoFromJson(Map<String, dynamic> json) => DemoMeDto(
  enabled: json['enabled'] as bool,
  canCreate: json['canCreate'] as bool,
  maxAccounts: json['maxAccounts'] as num,
  ttlDays: json['ttlDays'] as num,
  accounts: (json['accounts'] as List<dynamic>)
      .map((e) => DemoAccountDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$DemoMeDtoToJson(DemoMeDto instance) => <String, dynamic>{
  'enabled': instance.enabled,
  'canCreate': instance.canCreate,
  'maxAccounts': instance.maxAccounts,
  'ttlDays': instance.ttlDays,
  'accounts': instance.accounts.map((e) => e.toJson()).toList(),
};
