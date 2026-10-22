// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_totp_setup_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTotpSetupResultDto _$AdminTotpSetupResultDtoFromJson(
  Map<String, dynamic> json,
) => AdminTotpSetupResultDto(
  recoveryCodes: (json['recoveryCodes'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  session: AdminSessionDto.fromJson(json['session'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminTotpSetupResultDtoToJson(
  AdminTotpSetupResultDto instance,
) => <String, dynamic>{
  'recoveryCodes': instance.recoveryCodes,
  'session': instance.session.toJson(),
};
