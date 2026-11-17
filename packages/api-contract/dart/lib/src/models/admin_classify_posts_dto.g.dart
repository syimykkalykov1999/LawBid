// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_classify_posts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminClassifyPostsDto _$AdminClassifyPostsDtoFromJson(
  Map<String, dynamic> json,
) => AdminClassifyPostsDto(
  contentClass: AdminPostClassAction.fromJson(json['contentClass'] as String),
  ids: (json['ids'] as List<dynamic>?)?.map((e) => e as String).toList(),
  filter: json['filter'] == null
      ? null
      : AdminContentBulkFilterDto.fromJson(
          json['filter'] as Map<String, dynamic>,
        ),
);

Map<String, dynamic> _$AdminClassifyPostsDtoToJson(
  AdminClassifyPostsDto instance,
) => <String, dynamic>{
  'ids': ?instance.ids,
  'filter': ?instance.filter?.toJson(),
  'contentClass': instance.contentClass.toJson(),
};
