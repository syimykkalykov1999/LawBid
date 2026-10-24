// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_subscription_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuSubscriptionDto _$SfuSubscriptionDtoFromJson(Map<String, dynamic> json) =>
    SfuSubscriptionDto(
      userId: json['userId'] as String,
      trackName: SfuSubscriptionDtoTrackName.fromJson(
        json['trackName'] as String,
      ),
      mid: json['mid'] as String,
    );

Map<String, dynamic> _$SfuSubscriptionDtoToJson(SfuSubscriptionDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'trackName': instance.trackName.toJson(),
      'mid': instance.mid,
    };
