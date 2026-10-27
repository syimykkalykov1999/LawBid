// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'calendar_connection_dto.dart';

part 'calendar_providers_dto.g.dart';

@JsonSerializable()
class CalendarProvidersDto {
  const CalendarProvidersDto({
    required this.googleEnabled,
    required this.microsoftEnabled,
    required this.connections,
  });

  factory CalendarProvidersDto.fromJson(Map<String, Object?> json) =>
      _$CalendarProvidersDtoFromJson(json);

  /// Google link is switched on by the admin.
  final bool googleEnabled;

  /// Outlook link is switched on by the admin.
  final bool microsoftEnabled;
  final List<CalendarConnectionDto> connections;

  Map<String, Object?> toJson() => _$CalendarProvidersDtoToJson(this);
}
