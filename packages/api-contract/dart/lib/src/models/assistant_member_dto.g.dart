// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'assistant_member_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AssistantMemberDto _$AssistantMemberDtoFromJson(Map<String, dynamic> json) =>
    AssistantMemberDto(
      id: json['id'] as String,
      phone: json['phone'] as String,
      status: AssistantMemberDtoStatus.fromJson(json['status'] as String),
      approval: AssistantMemberDtoApproval.fromJson(json['approval'] as String),
      duties: (json['duties'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      createdAt: json['createdAt'] as String,
      name: json['name'] as String?,
      joinedAt: json['joinedAt'] as String?,
      liabilityAcceptedAt: json['liabilityAcceptedAt'] as String?,
    );

Map<String, dynamic> _$AssistantMemberDtoToJson(AssistantMemberDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'phone': instance.phone,
      'name': ?instance.name,
      'status': instance.status.toJson(),
      'approval': instance.approval.toJson(),
      'duties': instance.duties,
      'joinedAt': ?instance.joinedAt,
      'createdAt': instance.createdAt,
      'liabilityAcceptedAt': ?instance.liabilityAcceptedAt,
    };
