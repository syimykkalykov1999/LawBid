// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'assistant_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AssistantRequestDto _$AssistantRequestDtoFromJson(Map<String, dynamic> json) =>
    AssistantRequestDto(
      id: json['id'] as String,
      membershipId: json['membershipId'] as String,
      assistantName: json['assistantName'] as String,
      kind: AssistantRequestKind.fromJson(json['kind'] as String),
      payload: json['payload'],
      status: AssistantRequestStatus.fromJson(json['status'] as String),
      createdAt: json['createdAt'] as String,
      resultId: json['resultId'] as String?,
      note: json['note'] as String?,
      decidedAt: json['decidedAt'] as String?,
    );

Map<String, dynamic> _$AssistantRequestDtoToJson(
  AssistantRequestDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'membershipId': instance.membershipId,
  'assistantName': instance.assistantName,
  'kind': instance.kind.toJson(),
  'payload': ?instance.payload,
  'status': instance.status.toJson(),
  'resultId': ?instance.resultId,
  'note': ?instance.note,
  'createdAt': instance.createdAt,
  'decidedAt': ?instance.decidedAt,
};
