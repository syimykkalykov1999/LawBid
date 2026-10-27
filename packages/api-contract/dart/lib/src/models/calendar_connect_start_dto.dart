// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'calendar_connect_start_dto.g.dart';

@JsonSerializable()
class CalendarConnectStartDto {
  const CalendarConnectStartDto({required this.url});

  factory CalendarConnectStartDto.fromJson(Map<String, Object?> json) =>
      _$CalendarConnectStartDtoFromJson(json);

  /// Open this vendor sign-in page in the browser.
  final String url;

  Map<String, Object?> toJson() => _$CalendarConnectStartDtoToJson(this);
}
