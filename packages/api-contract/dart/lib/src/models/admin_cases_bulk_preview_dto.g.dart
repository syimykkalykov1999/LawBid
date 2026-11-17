// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_cases_bulk_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminCasesBulkPreviewDto _$AdminCasesBulkPreviewDtoFromJson(
  Map<String, dynamic> json,
) => AdminCasesBulkPreviewDto(
  filter: AdminCasesFilterDto.fromJson(json['filter'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminCasesBulkPreviewDtoToJson(
  AdminCasesBulkPreviewDto instance,
) => <String, dynamic>{'filter': instance.filter.toJson()};
