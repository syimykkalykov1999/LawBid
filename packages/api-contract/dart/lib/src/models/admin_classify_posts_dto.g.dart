// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_classify_posts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminClassifyPostsDto _$AdminClassifyPostsDtoFromJson(
  Map<String, dynamic> json,
) => AdminClassifyPostsDto(
  ids: (json['ids'] as List<dynamic>).map((e) => e as String).toList(),
  contentClass: AdminPostClassAction.fromJson(json['contentClass'] as String),
);

Map<String, dynamic> _$AdminClassifyPostsDtoToJson(
  AdminClassifyPostsDto instance,
) => <String, dynamic>{
  'ids': instance.ids,
  'contentClass': instance.contentClass.toJson(),
};
