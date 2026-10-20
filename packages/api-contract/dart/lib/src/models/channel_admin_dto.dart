// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'channel_role.dart';
import 'user_brief_dto.dart';

part 'channel_admin_dto.g.dart';

@JsonSerializable()
class ChannelAdminDto {
  const ChannelAdminDto({required this.user, required this.role});

  factory ChannelAdminDto.fromJson(Map<String, Object?> json) =>
      _$ChannelAdminDtoFromJson(json);

  final UserBriefDto user;
  final ChannelRole role;

  Map<String, Object?> toJson() => _$ChannelAdminDtoToJson(this);
}
