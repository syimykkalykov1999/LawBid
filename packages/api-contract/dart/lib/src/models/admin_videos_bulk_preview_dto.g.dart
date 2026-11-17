// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_videos_bulk_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminVideosBulkPreviewDto _$AdminVideosBulkPreviewDtoFromJson(
  Map<String, dynamic> json,
) => AdminVideosBulkPreviewDto(
  filter: AdminVideosFilterDto.fromJson(json['filter'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminVideosBulkPreviewDtoToJson(
  AdminVideosBulkPreviewDto instance,
) => <String, dynamic>{'filter': instance.filter.toJson()};
