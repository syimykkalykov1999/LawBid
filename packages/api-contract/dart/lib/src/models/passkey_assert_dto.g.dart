// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'passkey_assert_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PasskeyAssertDto _$PasskeyAssertDtoFromJson(Map<String, dynamic> json) =>
    PasskeyAssertDto(
      challengeId: json['challengeId'] as String,
      response: json['response'],
    );

Map<String, dynamic> _$PasskeyAssertDtoToJson(PasskeyAssertDto instance) =>
    <String, dynamic>{
      'challengeId': instance.challengeId,
      'response': ?instance.response,
    };
