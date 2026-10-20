// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_group_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminGroupDetailDto _$AdminGroupDetailDtoFromJson(Map<String, dynamic> json) =>
    AdminGroupDetailDto(
      id: json['id'] as String,
      title: json['title'] as String,
      memberCount: json['memberCount'] as num,
      createdBy: json['createdBy'] as String,
      messageCount: json['messageCount'] as num,
      pollCount: json['pollCount'] as num,
      createdAt: DateTime.parse(json['createdAt'] as String),
      members: (json['members'] as List<dynamic>)
          .map((e) => GroupMemberDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      description: json['description'] as String?,
      ownerName: json['ownerName'] as String?,
      lastMessageAt: json['lastMessageAt'] == null
          ? null
          : DateTime.parse(json['lastMessageAt'] as String),
      deletedAt: json['deletedAt'] == null
          ? null
          : DateTime.parse(json['deletedAt'] as String),
    );

Map<String, dynamic> _$AdminGroupDetailDtoToJson(
  AdminGroupDetailDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'title': instance.title,
  'description': ?instance.description,
  'memberCount': instance.memberCount,
  'ownerName': ?instance.ownerName,
  'createdBy': instance.createdBy,
  'messageCount': instance.messageCount,
  'pollCount': instance.pollCount,
  'createdAt': instance.createdAt.toIso8601String(),
  'lastMessageAt': ?instance.lastMessageAt?.toIso8601String(),
  'deletedAt': ?instance.deletedAt?.toIso8601String(),
  'members': instance.members.map((e) => e.toJson()).toList(),
};
