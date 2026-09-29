// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'push_token_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PushTokenDto _$PushTokenDtoFromJson(Map<String, dynamic> json) => PushTokenDto(
  token: json['token'] as String,
  platform: PushTokenDtoPlatform.fromJson(json['platform'] as String),
);

Map<String, dynamic> _$PushTokenDtoToJson(PushTokenDto instance) =>
    <String, dynamic>{
      'token': instance.token,
      'platform': instance.platform.toJson(),
    };
