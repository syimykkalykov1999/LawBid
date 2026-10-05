// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'firm_link_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FirmLinkDto _$FirmLinkDtoFromJson(Map<String, dynamic> json) => FirmLinkDto(
  status: FirmLinkDtoStatus.fromJson(json['status'] as String),
  source: json['source'] == null
      ? null
      : FirmLinkDtoSource.fromJson(json['source'] as String),
  at: json['at'] == null ? null : DateTime.parse(json['at'] as String),
  emailDomain: json['emailDomain'] as String?,
);

Map<String, dynamic> _$FirmLinkDtoToJson(FirmLinkDto instance) =>
    <String, dynamic>{
      'status': instance.status.toJson(),
      'source': ?instance.source?.toJson(),
      'at': ?instance.at?.toIso8601String(),
      'emailDomain': ?instance.emailDomain,
    };
