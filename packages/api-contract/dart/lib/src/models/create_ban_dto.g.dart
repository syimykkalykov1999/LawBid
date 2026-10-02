// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_ban_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateBanDto _$CreateBanDtoFromJson(Map<String, dynamic> json) => CreateBanDto(
  kind: CreateBanDtoKind.fromJson(json['kind'] as String),
  value: json['value'] as String,
  reason: json['reason'] as String,
  days: json['days'] as num?,
);

Map<String, dynamic> _$CreateBanDtoToJson(CreateBanDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'value': instance.value,
      'reason': instance.reason,
      'days': ?instance.days,
    };
