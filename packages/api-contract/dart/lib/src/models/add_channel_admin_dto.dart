// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'add_channel_admin_dto.g.dart';

@JsonSerializable()
class AddChannelAdminDto {
  const AddChannelAdminDto({required this.username});

  factory AddChannelAdminDto.fromJson(Map<String, Object?> json) =>
      _$AddChannelAdminDtoFromJson(json);

  /// @username of the person to add.
  final String username;

  Map<String, Object?> toJson() => _$AddChannelAdminDtoToJson(this);
}
