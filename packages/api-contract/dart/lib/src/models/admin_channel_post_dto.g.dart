// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_channel_post_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminChannelPostDto _$AdminChannelPostDtoFromJson(Map<String, dynamic> json) =>
    AdminChannelPostDto(
      id: json['id'] as String,
      body: json['body'] as String,
      status: AdminChannelPostDtoStatus.fromJson(json['status'] as String),
      viewCount: (json['viewCount'] as num).toInt(),
      commentCount: (json['commentCount'] as num).toInt(),
      mediaCount: (json['mediaCount'] as num).toInt(),
      hasVideo: json['hasVideo'] as bool,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$AdminChannelPostDtoToJson(
  AdminChannelPostDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'body': instance.body,
  'status': instance.status.toJson(),
  'viewCount': instance.viewCount,
  'commentCount': instance.commentCount,
  'mediaCount': instance.mediaCount,
  'hasVideo': instance.hasVideo,
  'createdAt': instance.createdAt.toIso8601String(),
};
