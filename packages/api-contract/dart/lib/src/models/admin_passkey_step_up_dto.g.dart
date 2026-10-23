// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_passkey_step_up_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPasskeyStepUpDto _$AdminPasskeyStepUpDtoFromJson(
  Map<String, dynamic> json,
) => AdminPasskeyStepUpDto(
  challengeId: json['challengeId'] as String,
  response: json['response'],
);

Map<String, dynamic> _$AdminPasskeyStepUpDtoToJson(
  AdminPasskeyStepUpDto instance,
) => <String, dynamic>{
  'challengeId': instance.challengeId,
  'response': ?instance.response,
};
