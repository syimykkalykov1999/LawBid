// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'forward_target_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ForwardTargetDto _$ForwardTargetDtoFromJson(Map<String, dynamic> json) =>
    ForwardTargetDto(
      kind: ForwardTargetKind.fromJson(json['kind'] as String),
      id: json['id'] as String,
      topicId: json['topicId'] as String?,
    );

Map<String, dynamic> _$ForwardTargetDtoToJson(ForwardTargetDto instance) =>
    <String, dynamic>{
      'kind': instance.kind.toJson(),
      'id': instance.id,
      'topicId': ?instance.topicId,
    };
