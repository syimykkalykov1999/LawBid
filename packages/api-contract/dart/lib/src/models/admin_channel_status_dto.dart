// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_channel_status.dart';

part 'admin_channel_status_dto.g.dart';

@JsonSerializable()
class AdminChannelStatusDto {
  const AdminChannelStatusDto({required this.status, this.reason = ''});

  factory AdminChannelStatusDto.fromJson(Map<String, Object?> json) =>
      _$AdminChannelStatusDtoFromJson(json);

  final AdminChannelStatus status;

  /// Told to the owner when the channel is hidden or closed.
  final String reason;

  Map<String, Object?> toJson() => _$AdminChannelStatusDtoToJson(this);
}
