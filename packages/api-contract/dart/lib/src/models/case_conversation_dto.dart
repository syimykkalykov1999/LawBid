// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_conversation_dto_status.dart';

part 'case_conversation_dto.g.dart';

@JsonSerializable()
class CaseConversationDto {
  const CaseConversationDto({
    required this.conversationId,
    required this.status,
    required this.contactsUnlocked,
  });

  factory CaseConversationDto.fromJson(Map<String, Object?> json) =>
      _$CaseConversationDtoFromJson(json);

  final String conversationId;
  final CaseConversationDtoStatus status;
  final bool contactsUnlocked;

  Map<String, Object?> toJson() => _$CaseConversationDtoToJson(this);
}
