// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_license_expiry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SetLicenseExpiryDto _$SetLicenseExpiryDtoFromJson(Map<String, dynamic> json) =>
    SetLicenseExpiryDto(
      expiresAt: json['expiresAt'] == null
          ? null
          : DateTime.parse(json['expiresAt'] as String),
    );

Map<String, dynamic> _$SetLicenseExpiryDtoToJson(
  SetLicenseExpiryDto instance,
) => <String, dynamic>{'expiresAt': ?instance.expiresAt?.toIso8601String()};
