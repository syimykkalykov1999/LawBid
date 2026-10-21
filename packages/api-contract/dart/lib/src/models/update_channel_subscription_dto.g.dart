// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_channel_subscription_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateChannelSubscriptionDto _$UpdateChannelSubscriptionDtoFromJson(
  Map<String, dynamic> json,
) => UpdateChannelSubscriptionDto(
  muted: json['muted'] as bool?,
  mutedUntil: json['mutedUntil'] == null
      ? null
      : DateTime.parse(json['mutedUntil'] as String),
  pinned: json['pinned'] as bool?,
  archived: json['archived'] as bool?,
);

Map<String, dynamic> _$UpdateChannelSubscriptionDtoToJson(
  UpdateChannelSubscriptionDto instance,
) => <String, dynamic>{
  'muted': ?instance.muted,
  'mutedUntil': ?instance.mutedUntil?.toIso8601String(),
  'pinned': ?instance.pinned,
  'archived': ?instance.archived,
};
