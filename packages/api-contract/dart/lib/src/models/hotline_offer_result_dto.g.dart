// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'hotline_offer_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

HotlineOfferResultDto _$HotlineOfferResultDtoFromJson(
  Map<String, dynamic> json,
) => HotlineOfferResultDto(
  ok: json['ok'] as bool,
  state: HotlineOfferState.fromJson(json['state'] as String),
  callId: json['callId'] as String?,
);

Map<String, dynamic> _$HotlineOfferResultDtoToJson(
  HotlineOfferResultDto instance,
) => <String, dynamic>{
  'ok': instance.ok,
  'state': instance.state.toJson(),
  'callId': ?instance.callId,
};
