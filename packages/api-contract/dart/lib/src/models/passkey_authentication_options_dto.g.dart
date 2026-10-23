// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'passkey_authentication_options_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasskeyAuthenticationOptionsDto _$PasskeyAuthenticationOptionsDtoFromJson(
  Map<String, dynamic> json,
) => PasskeyAuthenticationOptionsDto(
  challengeId: json['challengeId'] as String,
  options: json['options'],
);

Map<String, dynamic> _$PasskeyAuthenticationOptionsDtoToJson(
  PasskeyAuthenticationOptionsDto instance,
) => <String, dynamic>{
  'challengeId': instance.challengeId,
  'options': ?instance.options,
};
