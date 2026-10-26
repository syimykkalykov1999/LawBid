// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sfu_subscribe_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SfuSubscribeResultDto _$SfuSubscribeResultDtoFromJson(
  Map<String, dynamic> json,
) => SfuSubscribeResultDto(
  requiresAnswer: json['requiresAnswer'] as bool,
  type: json['type'] == null
      ? null
      : SfuSubscribeResultDtoType.fromJson(json['type'] as String),
  sdp: json['sdp'] as String?,
  subscriptions: (json['subscriptions'] as List<dynamic>)
      .map((e) => SfuSubscriptionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  skipped: (json['skipped'] as List<dynamic>)
      .map((e) => SfuSkippedDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$SfuSubscribeResultDtoToJson(
  SfuSubscribeResultDto instance,
) => <String, dynamic>{
  'requiresAnswer': instance.requiresAnswer,
  'type': ?instance.type?.toJson(),
  'sdp': ?instance.sdp,
  'subscriptions': instance.subscriptions.map((e) => e.toJson()).toList(),
  'skipped': instance.skipped.map((e) => e.toJson()).toList(),
};
