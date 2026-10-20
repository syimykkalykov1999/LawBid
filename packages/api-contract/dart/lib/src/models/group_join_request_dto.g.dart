// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_join_request_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupJoinRequestDto _$GroupJoinRequestDtoFromJson(Map<String, dynamic> json) =>
    GroupJoinRequestDto(
      user: GroupPersonDto.fromJson(json['user'] as Map<String, dynamic>),
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$GroupJoinRequestDtoToJson(
  GroupJoinRequestDto instance,
) => <String, dynamic>{
  'user': instance.user.toJson(),
  'createdAt': instance.createdAt.toIso8601String(),
};
