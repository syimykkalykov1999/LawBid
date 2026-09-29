// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_conversation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseConversationDto _$CaseConversationDtoFromJson(Map<String, dynamic> json) =>
    CaseConversationDto(
      conversationId: json['conversationId'] as String,
      status: CaseConversationDtoStatus.fromJson(json['status'] as String),
      contactsUnlocked: json['contactsUnlocked'] as bool,
    );

Map<String, dynamic> _$CaseConversationDtoToJson(
  CaseConversationDto instance,
) => <String, dynamic>{
  'conversationId': instance.conversationId,
  'status': instance.status.toJson(),
  'contactsUnlocked': instance.contactsUnlocked,
};
