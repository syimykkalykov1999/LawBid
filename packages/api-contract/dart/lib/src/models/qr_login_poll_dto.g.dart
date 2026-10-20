// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'qr_login_poll_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

QrLoginPollDto _$QrLoginPollDtoFromJson(Map<String, dynamic> json) =>
    QrLoginPollDto(
      qrId: json['qrId'] as String,
      pollSecret: json['pollSecret'] as String,
    );

Map<String, dynamic> _$QrLoginPollDtoToJson(QrLoginPollDto instance) =>
    <String, dynamic>{'qrId': instance.qrId, 'pollSecret': instance.pollSecret};
