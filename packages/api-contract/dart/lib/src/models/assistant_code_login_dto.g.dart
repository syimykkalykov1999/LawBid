// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'assistant_code_login_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AssistantCodeLoginDto _$AssistantCodeLoginDtoFromJson(
  Map<String, dynamic> json,
) => AssistantCodeLoginDto(
  code: json['code'] as String,
  deviceInfo: json['deviceInfo'] == null
      ? null
      : DeviceInfoDto.fromJson(json['deviceInfo'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AssistantCodeLoginDtoToJson(
  AssistantCodeLoginDto instance,
) => <String, dynamic>{
  'code': instance.code,
  'deviceInfo': ?instance.deviceInfo?.toJson(),
};
