// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_channel_subscription_dto.g.dart';

@JsonSerializable()
class UpdateChannelSubscriptionDto {
  const UpdateChannelSubscriptionDto({required this.muted});

  factory UpdateChannelSubscriptionDto.fromJson(Map<String, Object?> json) =>
      _$UpdateChannelSubscriptionDtoFromJson(json);

  final bool muted;

  Map<String, Object?> toJson() => _$UpdateChannelSubscriptionDtoToJson(this);
}
