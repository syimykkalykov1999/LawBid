// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'restrict_reporter_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RestrictReporterDto _$RestrictReporterDtoFromJson(Map<String, dynamic> json) =>
    RestrictReporterDto(
      note: json['note'] as String,
      days: (json['days'] as num).toInt(),
    );

Map<String, dynamic> _$RestrictReporterDtoToJson(
  RestrictReporterDto instance,
) => <String, dynamic>{'note': instance.note, 'days': instance.days};
