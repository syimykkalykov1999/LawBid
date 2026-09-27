// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'i18n_import_report_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

I18nImportReportDto _$I18nImportReportDtoFromJson(Map<String, dynamic> json) =>
    I18nImportReportDto(
      mode: I18nImportMode.fromJson(json['mode'] as String),
      valid: json['valid'] as bool,
      applied: json['applied'] as bool,
      newLanguages: (json['newLanguages'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      newKeys: (json['newKeys'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      changedKeys: (json['changedKeys'] as List<dynamic>)
          .map((e) => I18nChangedEntryDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      unchangedCount: (json['unchangedCount'] as num).toInt(),
      errors: (json['errors'] as List<dynamic>)
          .map((e) => I18nImportErrorDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$I18nImportReportDtoToJson(
  I18nImportReportDto instance,
) => <String, dynamic>{
  'mode': instance.mode.toJson(),
  'valid': instance.valid,
  'applied': instance.applied,
  'newLanguages': instance.newLanguages,
  'newKeys': instance.newKeys,
  'changedKeys': instance.changedKeys.map((e) => e.toJson()).toList(),
  'unchangedCount': instance.unchangedCount,
  'errors': instance.errors.map((e) => e.toJson()).toList(),
};
