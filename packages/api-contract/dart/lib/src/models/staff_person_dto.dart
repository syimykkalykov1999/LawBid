// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_open_suggestion_dto.dart';
import 'staff_rating_status.dart';
import 'staff_workspace_name.dart';

part 'staff_person_dto.g.dart';

@JsonSerializable()
class StaffPersonDto {
  const StaffPersonDto({
    required this.adminId,
    required this.name,
    required this.workspace,
    required this.rating,
    required this.decisions,
    required this.status,
    required this.flags,
    required this.rankPct,
    required this.accuracy,
    required this.clean,
    required this.usersVerdict,
    required this.speed,
    required this.openSuggestions,
  });

  factory StaffPersonDto.fromJson(Map<String, Object?> json) =>
      _$StaffPersonDtoFromJson(json);

  final String adminId;
  final String name;
  final StaffWorkspaceName workspace;

  /// 0-100; null = not enough data.
  final num? rating;

  /// Decisions in the window.
  final num decisions;
  final StaffRatingStatus status;
  final List<String> flags;

  /// Top-percent place in the workspace (1 = best).
  final num? rankPct;
  final num? accuracy;
  final num? clean;
  final num? usersVerdict;
  final num? speed;
  final List<StaffOpenSuggestionDto> openSuggestions;

  Map<String, Object?> toJson() => _$StaffPersonDtoToJson(this);
}
