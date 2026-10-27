// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_users_bulk_preview_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUsersBulkPreviewResultDto _$AdminUsersBulkPreviewResultDtoFromJson(
  Map<String, dynamic> json,
) => AdminUsersBulkPreviewResultDto(
  matched: (json['matched'] as num).toInt(),
  capped: json['capped'] as bool,
  cap: (json['cap'] as num).toInt(),
);

Map<String, dynamic> _$AdminUsersBulkPreviewResultDtoToJson(
  AdminUsersBulkPreviewResultDto instance,
) => <String, dynamic>{
  'matched': instance.matched,
  'capped': instance.capped,
  'cap': instance.cap,
};
