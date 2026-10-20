// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_join_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupJoinResultDto _$GroupJoinResultDtoFromJson(Map<String, dynamic> json) =>
    GroupJoinResultDto(
      status: GroupJoinResultDtoStatus.fromJson(json['status'] as String),
      groupId: json['groupId'] as String,
      group: json['group'] == null
          ? null
          : GroupDetailDto.fromJson(json['group'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$GroupJoinResultDtoToJson(GroupJoinResultDto instance) =>
    <String, dynamic>{
      'status': instance.status.toJson(),
      'groupId': instance.groupId,
      'group': ?instance.group?.toJson(),
    };
