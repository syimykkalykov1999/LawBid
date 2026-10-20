// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'qr_login_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QrLoginPreviewDto _$QrLoginPreviewDtoFromJson(Map<String, dynamic> json) =>
    QrLoginPreviewDto(
      deviceName: json['deviceName'] as String?,
      platform: json['platform'] as String?,
      userAgent: json['userAgent'] as String?,
      ipHint: json['ipHint'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
      expiresIn: (json['expiresIn'] as num).toInt(),
    );

Map<String, dynamic> _$QrLoginPreviewDtoToJson(QrLoginPreviewDto instance) =>
    <String, dynamic>{
      'deviceName': ?instance.deviceName,
      'platform': ?instance.platform,
      'userAgent': ?instance.userAgent,
      'ipHint': ?instance.ipHint,
      'createdAt': instance.createdAt.toIso8601String(),
      'expiresIn': instance.expiresIn,
    };
