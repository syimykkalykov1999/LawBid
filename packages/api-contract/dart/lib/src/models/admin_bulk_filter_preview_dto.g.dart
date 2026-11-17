// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_bulk_filter_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminBulkFilterPreviewDto _$AdminBulkFilterPreviewDtoFromJson(
  Map<String, dynamic> json,
) => AdminBulkFilterPreviewDto(
  matched: (json['matched'] as num).toInt(),
  capped: json['capped'] as bool,
  cap: (json['cap'] as num?)?.toInt(),
);

Map<String, dynamic> _$AdminBulkFilterPreviewDtoToJson(
  AdminBulkFilterPreviewDto instance,
) => <String, dynamic>{
  'matched': instance.matched,
  'capped': instance.capped,
  'cap': ?instance.cap,
};
