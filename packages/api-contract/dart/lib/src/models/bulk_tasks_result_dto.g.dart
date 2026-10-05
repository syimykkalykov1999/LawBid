// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bulk_tasks_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BulkTasksResultDto _$BulkTasksResultDtoFromJson(Map<String, dynamic> json) =>
    BulkTasksResultDto(
      affected: json['affected'] as num,
      skipped: json['skipped'] as num,
    );

Map<String, dynamic> _$BulkTasksResultDtoToJson(BulkTasksResultDto instance) =>
    <String, dynamic>{
      'affected': instance.affected,
      'skipped': instance.skipped,
    };
