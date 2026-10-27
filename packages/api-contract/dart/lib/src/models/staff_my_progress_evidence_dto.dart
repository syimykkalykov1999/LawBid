// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'staff_my_progress_evidence_dto.g.dart';

@JsonSerializable()
class StaffMyProgressEvidenceDto {
  const StaffMyProgressEvidenceDto({required this.trend});

  factory StaffMyProgressEvidenceDto.fromJson(Map<String, Object?> json) =>
      _$StaffMyProgressEvidenceDtoFromJson(json);

  /// The weekly trend of the rating (oldest first).
  final List<dynamic> trend;

  Map<String, Object?> toJson() => _$StaffMyProgressEvidenceDtoToJson(this);
}
