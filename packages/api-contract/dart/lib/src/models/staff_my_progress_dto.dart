// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_my_open_suggestion_dto.dart';
import 'staff_my_progress_evidence_dto.dart';
import 'staff_rating_status.dart';

part 'staff_my_progress_dto.g.dart';

@JsonSerializable()
class StaffMyProgressDto {
  const StaffMyProgressDto({
    required this.snapshotDate,
    required this.rating,
    required this.status,
    required this.decisions,
    required this.rankPct,
    required this.flags,
    required this.accuracy,
    required this.clean,
    required this.usersVerdict,
    required this.speed,
    required this.openSuggestions,
    required this.evidence,
  });

  factory StaffMyProgressDto.fromJson(Map<String, Object?> json) =>
      _$StaffMyProgressDtoFromJson(json);

  final DateTime snapshotDate;
  final num? rating;
  final StaffRatingStatus status;
  final int decisions;
  final num? rankPct;
  final List<String> flags;
  final num? accuracy;
  final num? clean;
  final num? usersVerdict;
  final num? speed;
  final List<StaffMyOpenSuggestionDto> openSuggestions;
  final StaffMyProgressEvidenceDto evidence;

  Map<String, Object?> toJson() => _$StaffMyProgressDtoToJson(this);
}
