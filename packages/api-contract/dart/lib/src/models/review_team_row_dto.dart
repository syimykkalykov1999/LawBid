// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'review_team_row_dto.g.dart';

@JsonSerializable()
class ReviewTeamRowDto {
  const ReviewTeamRowDto({
    required this.adminId,
    required this.name,
    required this.decisions,
    required this.returnedRate,
    required this.sampled,
    required this.overturned,
    required this.goldenTotal,
    required this.goldenFailed,
  });

  factory ReviewTeamRowDto.fromJson(Map<String, Object?> json) =>
      _$ReviewTeamRowDtoFromJson(json);

  final String adminId;
  final String name;
  final num decisions;

  /// Percent of closed items that came back (reopened or complained about).
  final num? returnedRate;
  final num sampled;
  final num overturned;
  final num goldenTotal;
  final num goldenFailed;

  Map<String, Object?> toJson() => _$ReviewTeamRowDtoToJson(this);
}
