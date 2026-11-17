// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_hour_dto.g.dart';

@JsonSerializable()
class HotlineHourDto {
  const HotlineHourDto({
    required this.hour,
    required this.requests,
    required this.offers,
    required this.accepted,
    required this.declined,
    required this.timeouts,
    required this.ended,
    required this.talkSeconds,
    required this.notices,
    required this.peakOnline,
  });

  factory HotlineHourDto.fromJson(Map<String, Object?> json) =>
      _$HotlineHourDtoFromJson(json);

  final String hour;
  final num requests;
  final num offers;
  final num accepted;
  final num declined;
  final num timeouts;
  final num ended;
  final num talkSeconds;
  final num notices;
  final num peakOnline;

  Map<String, Object?> toJson() => _$HotlineHourDtoToJson(this);
}
