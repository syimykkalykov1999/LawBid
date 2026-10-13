// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'password_reset_sent_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasswordResetSentDto _$PasswordResetSentDtoFromJson(
  Map<String, dynamic> json,
) => PasswordResetSentDto(
  sent: json['sent'] as bool,
  channel: PasswordResetSentDtoChannel.fromJson(json['channel'] as String),
);

Map<String, dynamic> _$PasswordResetSentDtoToJson(
  PasswordResetSentDto instance,
) => <String, dynamic>{
  'sent': instance.sent,
  'channel': instance.channel.toJson(),
};
