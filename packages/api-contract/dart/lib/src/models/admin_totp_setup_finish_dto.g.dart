// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_totp_setup_finish_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTotpSetupFinishDto _$AdminTotpSetupFinishDtoFromJson(
  Map<String, dynamic> json,
) => AdminTotpSetupFinishDto(
  ticket: json['ticket'] as String,
  code: json['code'] as String,
);

Map<String, dynamic> _$AdminTotpSetupFinishDtoToJson(
  AdminTotpSetupFinishDto instance,
) => <String, dynamic>{'ticket': instance.ticket, 'code': instance.code};
