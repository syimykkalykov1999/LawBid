// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_login_verify_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminLoginVerifyResultDto _$AdminLoginVerifyResultDtoFromJson(
  Map<String, dynamic> json,
) => AdminLoginVerifyResultDto(
  ticket: json['ticket'] as String,
  totpEnrollment: json['totpEnrollment'] == null
      ? null
      : TotpEnrollmentDto.fromJson(
          json['totpEnrollment'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$AdminLoginVerifyResultDtoToJson(
  AdminLoginVerifyResultDto instance,
) => <String, dynamic>{
  'ticket': instance.ticket,
  'totpEnrollment': ?instance.totpEnrollment?.toJson(),
};
