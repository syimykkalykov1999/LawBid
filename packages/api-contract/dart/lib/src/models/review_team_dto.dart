// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'review_team_row_dto.dart';

part 'review_team_dto.g.dart';

@JsonSerializable()
class ReviewTeamDto {
  const ReviewTeamDto({required this.snapshotDate, required this.items});

  factory ReviewTeamDto.fromJson(Map<String, Object?> json) =>
      _$ReviewTeamDtoFromJson(json);

  /// Date of the nightly snapshot read.
  final String? snapshotDate;
  final List<ReviewTeamRowDto> items;

  Map<String, Object?> toJson() => _$ReviewTeamDtoToJson(this);
}
