// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_two_factor_enabled_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminTwoFactorEnabledDto _$AdminTwoFactorEnabledDtoFromJson(
  Map<String, dynamic> json,
) => AdminTwoFactorEnabledDto(
  recoveryCodes: (json['recoveryCodes'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
);

Map<String, dynamic> _$AdminTwoFactorEnabledDtoToJson(
  AdminTwoFactorEnabledDto instance,
) => <String, dynamic>{'recoveryCodes': instance.recoveryCodes};
