// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'channel_subscription_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChannelSubscriptionDto _$ChannelSubscriptionDtoFromJson(
  Map<String, dynamic> json,
) => ChannelSubscriptionDto(
  isSubscribed: json['isSubscribed'] as bool,
  isMuted: json['isMuted'] as bool,
  subscriberCount: (json['subscriberCount'] as num).toInt(),
  mutedUntil: json['mutedUntil'] == null
      ? null
      : DateTime.parse(json['mutedUntil'] as String),
  isPinned: json['isPinned'] as bool?,
  isArchived: json['isArchived'] as bool?,
);

Map<String, dynamic> _$ChannelSubscriptionDtoToJson(
  ChannelSubscriptionDto instance,
) => <String, dynamic>{
  'isSubscribed': instance.isSubscribed,
  'isMuted': instance.isMuted,
  'mutedUntil': ?instance.mutedUntil?.toIso8601String(),
  'isPinned': ?instance.isPinned,
  'isArchived': ?instance.isArchived,
  'subscriberCount': instance.subscriberCount,
};
