// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'replace_practice_areas_dto.g.dart';

@JsonSerializable()
class ReplacePracticeAreasDto {
  const ReplacePracticeAreasDto({required this.practiceAreaIds});

  factory ReplacePracticeAreasDto.fromJson(Map<String, Object?> json) =>
      _$ReplacePracticeAreasDtoFromJson(json);

  final List<String> practiceAreaIds;

  Map<String, Object?> toJson() => _$ReplacePracticeAreasDtoToJson(this);
}
