// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'qr_login_created_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QrLoginCreatedDto _$QrLoginCreatedDtoFromJson(Map<String, dynamic> json) =>
    QrLoginCreatedDto(
      qrId: json['qrId'] as String,
      pollSecret: json['pollSecret'] as String,
      qrUrl: json['qrUrl'] as String,
      expiresIn: (json['expiresIn'] as num).toInt(),
    );

Map<String, dynamic> _$QrLoginCreatedDtoToJson(QrLoginCreatedDto instance) =>
    <String, dynamic>{
      'qrId': instance.qrId,
      'pollSecret': instance.pollSecret,
      'qrUrl': instance.qrUrl,
      'expiresIn': instance.expiresIn,
    };
