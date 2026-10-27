// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_person_dto.dart';

part 'staff_shortlist_dto.g.dart';

@JsonSerializable()
class StaffShortlistDto {
  const StaffShortlistDto({
    required this.snapshotDate,
    required this.worst,
    required this.best,
  });

  factory StaffShortlistDto.fromJson(Map<String, Object?> json) =>
      _$StaffShortlistDtoFromJson(json);

  final String? snapshotDate;

  /// Red and yellow, worst first (at most 20).
  final List<StaffPersonDto> worst;

  /// The best (top of the workspace), at most 20.
  final List<StaffPersonDto> best;

  Map<String, Object?> toJson() => _$StaffShortlistDtoToJson(this);
}
