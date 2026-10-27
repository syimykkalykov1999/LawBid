// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'calendar_links_dto.g.dart';

@JsonSerializable()
class CalendarLinksDto {
  const CalendarLinksDto({
    required this.google,
    required this.outlook,
    this.ics,
  });

  factory CalendarLinksDto.fromJson(Map<String, Object?> json) =>
      _$CalendarLinksDtoFromJson(json);

  /// Opens a pre-filled new event in Google Calendar.
  final String google;

  /// Opens a pre-filled new event in Outlook.
  final String outlook;

  /// A signed link to a one-event .ics file (Apple Calendar and others).
  final String? ics;

  Map<String, Object?> toJson() => _$CalendarLinksDtoToJson(this);
}
