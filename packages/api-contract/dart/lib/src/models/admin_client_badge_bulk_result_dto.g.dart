// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_client_badge_bulk_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminClientBadgeBulkResultDto _$AdminClientBadgeBulkResultDtoFromJson(
  Map<String, dynamic> json,
) => AdminClientBadgeBulkResultDto(
  done: (json['done'] as List<dynamic>).map((e) => e as String).toList(),
  skipped: (json['skipped'] as List<dynamic>)
      .map((e) => Skipped.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$AdminClientBadgeBulkResultDtoToJson(
  AdminClientBadgeBulkResultDto instance,
) => <String, dynamic>{
  'done': instance.done,
  'skipped': instance.skipped.map((e) => e.toJson()).toList(),
};
