// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_broadcast_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateBroadcastDto _$CreateBroadcastDtoFromJson(Map<String, dynamic> json) =>
    CreateBroadcastDto(
      title: json['title'] as String,
      body: json['body'] as String,
      audience: BroadcastAudience.fromJson(json['audience'] as String),
      stateCode: json['stateCode'] as String?,
    );

Map<String, dynamic> _$CreateBroadcastDtoToJson(CreateBroadcastDto instance) =>
    <String, dynamic>{
      'title': instance.title,
      'body': instance.body,
      'audience': instance.audience.toJson(),
      'stateCode': ?instance.stateCode,
    };
