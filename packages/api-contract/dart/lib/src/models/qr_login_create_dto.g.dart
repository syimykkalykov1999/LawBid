// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'qr_login_create_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QrLoginCreateDto _$QrLoginCreateDtoFromJson(Map<String, dynamic> json) =>
    QrLoginCreateDto(
      deviceInfo: json['deviceInfo'] == null
          ? null
          : DeviceInfoDto.fromJson(json['deviceInfo'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$QrLoginCreateDtoToJson(QrLoginCreateDto instance) =>
    <String, dynamic>{'deviceInfo': ?instance.deviceInfo?.toJson()};
