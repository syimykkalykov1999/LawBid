// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'voip_token_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VoipTokenDto _$VoipTokenDtoFromJson(Map<String, dynamic> json) => VoipTokenDto(
  token: json['token'] as String,
  bundleId: json['bundleId'] as String,
  environment: VoipTokenDtoEnvironment.fromJson(json['environment'] as String),
);

Map<String, dynamic> _$VoipTokenDtoToJson(VoipTokenDto instance) =>
    <String, dynamic>{
      'token': instance.token,
      'bundleId': instance.bundleId,
      'environment': instance.environment.toJson(),
    };
