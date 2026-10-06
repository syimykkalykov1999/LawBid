// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'demo_tokens_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DemoTokensDto _$DemoTokensDtoFromJson(Map<String, dynamic> json) =>
    DemoTokensDto(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      accessTokenExpiresIn: json['accessTokenExpiresIn'] as num,
    );

Map<String, dynamic> _$DemoTokensDtoToJson(DemoTokensDto instance) =>
    <String, dynamic>{
      'accessToken': instance.accessToken,
      'refreshToken': instance.refreshToken,
      'accessTokenExpiresIn': instance.accessTokenExpiresIn,
    };
