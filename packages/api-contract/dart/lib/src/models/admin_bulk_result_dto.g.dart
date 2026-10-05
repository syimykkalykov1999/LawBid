// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_bulk_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBulkResultDto _$AdminBulkResultDtoFromJson(Map<String, dynamic> json) =>
    AdminBulkResultDto(
      done: (json['done'] as List<dynamic>).map((e) => e as String).toList(),
      skipped: (json['skipped'] as List<dynamic>)
          .map((e) => AdminBulkSkippedDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$AdminBulkResultDtoToJson(AdminBulkResultDto instance) =>
    <String, dynamic>{
      'done': instance.done,
      'skipped': instance.skipped.map((e) => e.toJson()).toList(),
    };
