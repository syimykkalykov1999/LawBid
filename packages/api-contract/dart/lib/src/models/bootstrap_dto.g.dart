// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bootstrap_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BootstrapDto _$BootstrapDtoFromJson(Map<String, dynamic> json) => BootstrapDto(
  flags: Map<String, bool>.from(json['flags'] as Map),
  appConfig: json['app_config'],
  languages: (json['languages'] as List<dynamic>)
      .map((e) => I18nLanguageDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  translationsVersion: Map<String, int>.from(
    json['translations_version'] as Map,
  ),
  legalDocuments: (json['legal_documents'] as List<dynamic>)
      .map((e) => BootstrapLegalDocumentDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$BootstrapDtoToJson(
  BootstrapDto instance,
) => <String, dynamic>{
  'flags': instance.flags,
  'app_config': ?instance.appConfig,
  'languages': instance.languages.map((e) => e.toJson()).toList(),
  'translations_version': instance.translationsVersion,
  'legal_documents': instance.legalDocuments.map((e) => e.toJson()).toList(),
};
