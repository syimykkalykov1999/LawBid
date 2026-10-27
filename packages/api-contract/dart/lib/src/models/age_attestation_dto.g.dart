// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'age_attestation_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AgeAttestationDto _$AgeAttestationDtoFromJson(Map<String, dynamic> json) =>
    AgeAttestationDto(
      confirmed: json['confirmed'] as bool,
      textVersion: json['textVersion'] as String,
      birthDate: json['birthDate'] as String?,
    );

Map<String, dynamic> _$AgeAttestationDtoToJson(AgeAttestationDto instance) =>
    <String, dynamic>{
      'confirmed': instance.confirmed,
      'textVersion': instance.textVersion,
      'birthDate': ?instance.birthDate,
    };
