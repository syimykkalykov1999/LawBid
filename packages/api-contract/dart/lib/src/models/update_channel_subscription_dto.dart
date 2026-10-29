// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_channel_subscription_dto.g.dart';

@JsonSerializable()
class UpdateChannelSubscriptionDto {
  const UpdateChannelSubscriptionDto({
    this.muted,
    this.mutedUntil,
    this.pinned,
    this.archived,
  });
  
  factory UpdateChannelSubscriptionDto.fromJson(Map<String, Object?> json) => _$UpdateChannelSubscriptionDtoFromJson(json);
  
  /// true = muted for good, false = unmuted (also ends a timed mute).
  final bool? muted;

  /// Muted until this moment (1 h / 8 h / 2 days).
  final DateTime? mutedUntil;
  final bool? pinned;
  final bool? archived;

  Map<String, Object?> toJson() => _$UpdateChannelSubscriptionDtoToJson(this);
}
