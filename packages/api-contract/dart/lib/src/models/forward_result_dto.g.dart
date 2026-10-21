// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'forward_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ForwardResultDto _$ForwardResultDtoFromJson(Map<String, dynamic> json) =>
    ForwardResultDto(
      target: ForwardTargetDto.fromJson(json['target'] as Map<String, dynamic>),
      sourceId: json['sourceId'] as String,
      status: ForwardStatus.fromJson(json['status'] as String),
      code: json['code'] as String?,
      messageId: json['messageId'] as String?,
    );

Map<String, dynamic> _$ForwardResultDtoToJson(ForwardResultDto instance) =>
    <String, dynamic>{
      'target': instance.target.toJson(),
      'sourceId': instance.sourceId,
      'status': instance.status.toJson(),
      'code': ?instance.code,
      'messageId': ?instance.messageId,
    };
