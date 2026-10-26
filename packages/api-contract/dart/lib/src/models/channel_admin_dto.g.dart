// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_admin_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelAdminDto _$ChannelAdminDtoFromJson(Map<String, dynamic> json) =>
    ChannelAdminDto(
      user: UserBriefDto.fromJson(json['user'] as Map<String, dynamic>),
      role: ChannelRole.fromJson(json['role'] as String),
    );

Map<String, dynamic> _$ChannelAdminDtoToJson(ChannelAdminDto instance) =>
    <String, dynamic>{
      'user': instance.user.toJson(),
      'role': instance.role.toJson(),
    };
