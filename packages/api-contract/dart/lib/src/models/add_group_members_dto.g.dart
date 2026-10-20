// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'add_group_members_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AddGroupMembersDto _$AddGroupMembersDtoFromJson(Map<String, dynamic> json) =>
    AddGroupMembersDto(
      userIds: (json['userIds'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$AddGroupMembersDtoToJson(AddGroupMembersDto instance) =>
    <String, dynamic>{'userIds': instance.userIds};
