// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'totp_enrollment_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TotpEnrollmentDto _$TotpEnrollmentDtoFromJson(Map<String, dynamic> json) =>
    TotpEnrollmentDto(
      secret: json['secret'] as String,
      otpauthUri: json['otpauthUri'] as String,
    );

Map<String, dynamic> _$TotpEnrollmentDtoToJson(TotpEnrollmentDto instance) =>
    <String, dynamic>{
      'secret': instance.secret,
      'otpauthUri': instance.otpauthUri,
    };
