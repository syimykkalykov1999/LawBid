// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'broadcast_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BroadcastDto _$BroadcastDtoFromJson(Map<String, dynamic> json) => BroadcastDto(
  id: json['id'] as String,
  title: json['title'] as String,
  body: json['body'] as String,
  audience: json['audience'] as String,
  stateCodes: (json['stateCodes'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  recipients: (json['recipients'] as num).toInt(),
  createdAt: json['createdAt'] as String,
  stateCode: json['stateCode'] as String?,
);

Map<String, dynamic> _$BroadcastDtoToJson(BroadcastDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'body': instance.body,
      'audience': instance.audience,
      'stateCode': ?instance.stateCode,
      'stateCodes': instance.stateCodes,
      'recipients': instance.recipients,
      'createdAt': instance.createdAt,
    };
