// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_totp_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTotpDto _$AdminTotpDtoFromJson(Map<String, dynamic> json) => AdminTotpDto(
  ticket: json['ticket'] as String,
  code: json['code'] as String,
);

Map<String, dynamic> _$AdminTotpDtoToJson(AdminTotpDto instance) =>
    <String, dynamic>{'ticket': instance.ticket, 'code': instance.code};
