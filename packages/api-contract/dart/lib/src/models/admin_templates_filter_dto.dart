// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_templates_filter_dto.g.dart';

@JsonSerializable()
class AdminTemplatesFilterDto {
  const AdminTemplatesFilterDto({
    this.q,
    this.practiceAreaId,
    this.state,
    this.language,
    this.published,
  });

  factory AdminTemplatesFilterDto.fromJson(Map<String, Object?> json) =>
      _$AdminTemplatesFilterDtoFromJson(json);

  /// Search in title and description.
  final String? q;
  final String? practiceAreaId;

  /// Two-letter state; templates for every state are included.
  final String? state;
  final String? language;

  /// true = published, false = drafts.
  final bool? published;

  Map<String, Object?> toJson() => _$AdminTemplatesFilterDtoToJson(this);
}
