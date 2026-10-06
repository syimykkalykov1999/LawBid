// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'demo_current_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DemoCurrentDto _$DemoCurrentDtoFromJson(Map<String, dynamic> json) =>
    DemoCurrentDto(
      account: DemoAccountDto.fromJson(json['account'] as Map<String, dynamic>),
      bannerText: json['bannerText'] as String,
    );

Map<String, dynamic> _$DemoCurrentDtoToJson(DemoCurrentDto instance) =>
    <String, dynamic>{
      'account': instance.account.toJson(),
      'bannerText': instance.bannerText,
    };
