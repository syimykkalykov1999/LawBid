// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_passkey_login_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPasskeyLoginDto _$AdminPasskeyLoginDtoFromJson(
  Map<String, dynamic> json,
) => AdminPasskeyLoginDto(
  ticket: json['ticket'] as String,
  challengeId: json['challengeId'] as String,
  response: json['response'],
);

Map<String, dynamic> _$AdminPasskeyLoginDtoToJson(
  AdminPasskeyLoginDto instance,
) => <String, dynamic>{
  'ticket': instance.ticket,
  'challengeId': instance.challengeId,
  'response': ?instance.response,
};
