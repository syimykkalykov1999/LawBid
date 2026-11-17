// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'hotline_notify_me_dto.g.dart';

@JsonSerializable()
class HotlineNotifyMeDto {
  const HotlineNotifyMeDto({this.allowNight = false, this.timeZone});

  factory HotlineNotifyMeDto.fromJson(Map<String, Object?> json) =>
      _$HotlineNotifyMeDtoFromJson(json);

  /// IANA time zone of the phone (night window in its clock).
  final String? timeZone;

  /// Notify at night too.
  final bool allowNight;

  Map<String, Object?> toJson() => _$HotlineNotifyMeDtoToJson(this);
}
