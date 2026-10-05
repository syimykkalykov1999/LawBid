// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_send_email_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachSendEmailResultDto _$OutreachSendEmailResultDtoFromJson(
  Map<String, dynamic> json,
) => OutreachSendEmailResultDto(
  subject: json['subject'] as String,
  remainingToday: json['remainingToday'] as num,
);

Map<String, dynamic> _$OutreachSendEmailResultDtoToJson(
  OutreachSendEmailResultDto instance,
) => <String, dynamic>{
  'subject': instance.subject,
  'remainingToday': instance.remainingToday,
};
