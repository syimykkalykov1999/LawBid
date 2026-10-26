// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'status_incident_dto.dart';

part 'status_page_dto.g.dart';

@JsonSerializable()
class StatusPageDto {
  const StatusPageDto({required this.publishing, required this.incidents});

  factory StatusPageDto.fromJson(Map<String, Object?> json) =>
      _$StatusPageDtoFromJson(json);

  /// false until STATUS_PAGE_BUCKET is set: nothing is published.
  final bool publishing;
  final List<StatusIncidentDto> incidents;

  Map<String, Object?> toJson() => _$StatusPageDtoToJson(this);
}
