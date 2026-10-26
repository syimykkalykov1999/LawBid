// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_video_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminVideoRowDto _$AdminVideoRowDtoFromJson(Map<String, dynamic> json) =>
    AdminVideoRowDto(
      id: json['id'] as String,
      status: AdminVideoRowDtoStatus.fromJson(json['status'] as String),
      ownerId: json['ownerId'] as String,
      ownerName: json['ownerName'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      postId: json['postId'] as String?,
      postStatus: json['postStatus'] == null
          ? null
          : AdminVideoRowDtoPostStatus.fromJson(json['postStatus'] as String),
      durationSec: (json['durationSec'] as num?)?.toInt(),
      sizeBytes: (json['sizeBytes'] as num?)?.toInt(),
      failureReason: json['failureReason'] as String?,
      playbackUrl: json['playbackUrl'] as String?,
      thumbnailUrl: json['thumbnailUrl'] as String?,
      readyAt: json['readyAt'] == null
          ? null
          : DateTime.parse(json['readyAt'] as String),
      deletedAt: json['deletedAt'] == null
          ? null
          : DateTime.parse(json['deletedAt'] as String),
    );

Map<String, dynamic> _$AdminVideoRowDtoToJson(AdminVideoRowDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'status': instance.status.toJson(),
      'ownerId': instance.ownerId,
      'ownerName': instance.ownerName,
      'postId': ?instance.postId,
      'postStatus': ?instance.postStatus?.toJson(),
      'durationSec': ?instance.durationSec,
      'sizeBytes': ?instance.sizeBytes,
      'failureReason': ?instance.failureReason,
      'playbackUrl': ?instance.playbackUrl,
      'thumbnailUrl': ?instance.thumbnailUrl,
      'createdAt': instance.createdAt.toIso8601String(),
      'readyAt': ?instance.readyAt?.toIso8601String(),
      'deletedAt': ?instance.deletedAt?.toIso8601String(),
    };
