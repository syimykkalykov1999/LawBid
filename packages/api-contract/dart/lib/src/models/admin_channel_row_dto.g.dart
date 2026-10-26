// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_channel_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminChannelRowDto _$AdminChannelRowDtoFromJson(Map<String, dynamic> json) =>
    AdminChannelRowDto(
      id: json['id'] as String,
      title: json['title'] as String,
      username: json['username'] as String,
      ownerId: json['ownerId'] as String,
      ownerName: json['ownerName'] as String,
      status: AdminChannelStatus.fromJson(json['status'] as String),
      subscriberCount: (json['subscriberCount'] as num).toInt(),
      postCount: (json['postCount'] as num).toInt(),
      openReports: (json['openReports'] as num).toInt(),
      createdAt: DateTime.parse(json['createdAt'] as String),
      moderationNote: json['moderationNote'] as String?,
      lastPostAt: json['lastPostAt'] == null
          ? null
          : DateTime.parse(json['lastPostAt'] as String),
    );

Map<String, dynamic> _$AdminChannelRowDtoToJson(AdminChannelRowDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'username': instance.username,
      'ownerId': instance.ownerId,
      'ownerName': instance.ownerName,
      'status': instance.status.toJson(),
      'subscriberCount': instance.subscriberCount,
      'postCount': instance.postCount,
      'openReports': instance.openReports,
      'moderationNote': ?instance.moderationNote,
      'lastPostAt': ?instance.lastPostAt?.toIso8601String(),
      'createdAt': instance.createdAt.toIso8601String(),
    };
