// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'health_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HealthItemDto _$HealthItemDtoFromJson(Map<String, dynamic> json) =>
    HealthItemDto(
      key: HealthItemDtoKey.fromJson(json['key'] as String),
      status: HealthItemDtoStatus.fromJson(json['status'] as String),
      detail: json['detail'],
    );

Map<String, dynamic> _$HealthItemDtoToJson(HealthItemDto instance) =>
    <String, dynamic>{
      'key': instance.key.toJson(),
      'status': instance.status.toJson(),
      'detail': ?instance.detail,
    };
