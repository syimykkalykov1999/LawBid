// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'create_assistant_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CreateAssistantRequestDto _$CreateAssistantRequestDtoFromJson(
  Map<String, dynamic> json,
) => CreateAssistantRequestDto(
  kind: AssistantRequestKind.fromJson(json['kind'] as String),
  payload: json['payload'],
);

Map<String, dynamic> _$CreateAssistantRequestDtoToJson(
  CreateAssistantRequestDto instance,
) => <String, dynamic>{
  'kind': instance.kind.toJson(),
  'payload': ?instance.payload,
};
