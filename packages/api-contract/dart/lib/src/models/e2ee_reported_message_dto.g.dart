// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'e2ee_reported_message_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

E2eeReportedMessageDto _$E2eeReportedMessageDtoFromJson(
  Map<String, dynamic> json,
) => E2eeReportedMessageDto(
  messageId: json['messageId'] as String,
  plaintext: json['plaintext'] as String,
);

Map<String, dynamic> _$E2eeReportedMessageDtoToJson(
  E2eeReportedMessageDto instance,
) => <String, dynamic>{
  'messageId': instance.messageId,
  'plaintext': instance.plaintext,
};
