// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'demo_session_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DemoSessionDto _$DemoSessionDtoFromJson(Map<String, dynamic> json) =>
    DemoSessionDto(
      account: DemoAccountDto.fromJson(json['account'] as Map<String, dynamic>),
      tokens: DemoTokensDto.fromJson(json['tokens'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$DemoSessionDtoToJson(DemoSessionDto instance) =>
    <String, dynamic>{
      'account': instance.account.toJson(),
      'tokens': instance.tokens.toJson(),
    };
