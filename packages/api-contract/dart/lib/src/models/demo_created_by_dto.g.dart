// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'demo_created_by_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DemoCreatedByDto _$DemoCreatedByDtoFromJson(Map<String, dynamic> json) =>
    DemoCreatedByDto(
      kind: DemoCreatedByDtoKind.fromJson(json['kind'] as String),
      userId: json['userId'] as String?,
      name: json['name'] as String,
    );

Map<String, dynamic> _$DemoCreatedByDtoToJson(DemoCreatedByDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'userId': ?instance.userId,
      'name': instance.name,
    };
