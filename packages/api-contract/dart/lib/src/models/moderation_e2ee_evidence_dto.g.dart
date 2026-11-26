// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'moderation_e2ee_evidence_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModerationE2eeEvidenceDto _$ModerationE2eeEvidenceDtoFromJson(
  Map<String, dynamic> json,
) => ModerationE2eeEvidenceDto(
  messageId: json['messageId'] as String,
  text: json['text'] as String,
  verified: json['verified'] as bool,
  sentAt: DateTime.parse(json['sentAt'] as String),
);

Map<String, dynamic> _$ModerationE2eeEvidenceDtoToJson(
  ModerationE2eeEvidenceDto instance,
) => <String, dynamic>{
  'messageId': instance.messageId,
  'text': instance.text,
  'verified': instance.verified,
  'sentAt': instance.sentAt.toIso8601String(),
};
