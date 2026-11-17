// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_videos_bulk_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminVideosBulkDto _$AdminVideosBulkDtoFromJson(Map<String, dynamic> json) =>
    AdminVideosBulkDto(
      ids: (json['ids'] as List<dynamic>?)?.map((e) => e as String).toList(),
      filter: json['filter'] == null
          ? null
          : AdminVideosFilterDto.fromJson(
              json['filter'] as Map<String, dynamic>,
            ),
      reason: json['reason'] as String? ?? '',
    );

Map<String, dynamic> _$AdminVideosBulkDtoToJson(AdminVideosBulkDto instance) =>
    <String, dynamic>{
      'reason': instance.reason,
      'ids': ?instance.ids,
      'filter': ?instance.filter?.toJson(),
    };
