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
);

Map<String, dynamic> _$ChannelSubscriptionDtoToJson(
  ChannelSubscriptionDto instance,
) => <String, dynamic>{
  'isSubscribed': instance.isSubscribed,
  'isMuted': instance.isMuted,
  'subscriberCount': instance.subscriberCount,
};
