// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'sfu_subscription_dto_track_name.dart';

part 'sfu_subscription_dto.g.dart';

@JsonSerializable()
class SfuSubscriptionDto {
  const SfuSubscriptionDto({
    required this.userId,
    required this.trackName,
    required this.mid,
  });
  
  factory SfuSubscriptionDto.fromJson(Map<String, Object?> json) => _$SfuSubscriptionDtoFromJson(json);
  
  final String userId;
  final SfuSubscriptionDtoTrackName trackName;

  /// Your transceiver mid for this stream.
  final String mid;

  Map<String, Object?> toJson() => _$SfuSubscriptionDtoToJson(this);
}
