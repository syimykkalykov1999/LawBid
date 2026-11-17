// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'hotline_bucket_row_dto.dart';
import 'hotline_hour_dto.dart';

part 'hotline_live_dto.g.dart';

@JsonSerializable()
class HotlineLiveDto {
  const HotlineLiveDto({
    required this.enabled,
    required this.onLine,
    required this.idle,
    required this.offered,
    required this.inCall,
    required this.notAccepting,
    required this.paused,
    required this.waitingOnline,
    required this.waitingOffline,
    required this.callsNow,
    required this.buckets,
    required this.hours,
  });

  factory HotlineLiveDto.fromJson(Map<String, Object?> json) =>
      _$HotlineLiveDtoFromJson(json);

  final bool enabled;
  final num onLine;
  final num idle;
  final num offered;
  final num inCall;
  final num notAccepting;
  final num paused;
  final num waitingOnline;
  final num waitingOffline;
  final num callsNow;
  final List<HotlineBucketRowDto> buckets;
  final List<HotlineHourDto> hours;

  Map<String, Object?> toJson() => _$HotlineLiveDtoToJson(this);
}
