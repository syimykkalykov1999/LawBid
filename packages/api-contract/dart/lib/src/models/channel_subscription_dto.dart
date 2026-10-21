// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'channel_subscription_dto.g.dart';

@JsonSerializable()
class ChannelSubscriptionDto {
  const ChannelSubscriptionDto({
    required this.isSubscribed,
    required this.isMuted,
    required this.subscriberCount,
  });

  factory ChannelSubscriptionDto.fromJson(Map<String, Object?> json) =>
      _$ChannelSubscriptionDtoFromJson(json);

  final bool isSubscribed;
  final bool isMuted;
  final int subscriberCount;

  Map<String, Object?> toJson() => _$ChannelSubscriptionDtoToJson(this);
}
