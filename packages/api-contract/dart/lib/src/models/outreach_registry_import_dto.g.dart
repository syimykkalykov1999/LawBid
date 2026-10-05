// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_registry_import_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachRegistryImportDto _$OutreachRegistryImportDtoFromJson(
  Map<String, dynamic> json,
) => OutreachRegistryImportDto(
  state: OutreachRegistryState.fromJson(json['state'] as String),
  limit: json['limit'] as num? ?? 100,
  offset: json['offset'] as num? ?? 0,
  mode: json['mode'] == null
      ? OutreachImportMode.dryRun
      : OutreachImportMode.fromJson(json['mode'] as String),
  county: json['county'] as String?,
  city: json['city'] as String?,
  admittedFrom: json['admittedFrom'] as num?,
  partnerId: json['partnerId'] as String?,
);

Map<String, dynamic> _$OutreachRegistryImportDtoToJson(
  OutreachRegistryImportDto instance,
) => <String, dynamic>{
  'state': instance.state.toJson(),
  'county': ?instance.county,
  'city': ?instance.city,
  'admittedFrom': ?instance.admittedFrom,
  'limit': instance.limit,
  'offset': instance.offset,
  'mode': instance.mode.toJson(),
  'partnerId': ?instance.partnerId,
};
