// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'file_view_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FileViewDto _$FileViewDtoFromJson(Map<String, dynamic> json) => FileViewDto(
  id: json['id'] as String,
  viewerUserId: json['viewerUserId'] as String,
  viewerName: json['viewerName'] as String?,
  viewerAvatarUrl: json['viewerAvatarUrl'] as String?,
  viewerRole: json['viewerRole'] as String?,
  viewedAt: DateTime.parse(json['viewedAt'] as String),
  device: json['device'] as String?,
  platform: json['platform'] as String?,
  ip: json['ip'] as String?,
);

Map<String, dynamic> _$FileViewDtoToJson(FileViewDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'viewerUserId': instance.viewerUserId,
      'viewerName': ?instance.viewerName,
      'viewerAvatarUrl': ?instance.viewerAvatarUrl,
      'viewerRole': ?instance.viewerRole,
      'viewedAt': instance.viewedAt.toIso8601String(),
      'device': ?instance.device,
      'platform': ?instance.platform,
      'ip': ?instance.ip,
    };
