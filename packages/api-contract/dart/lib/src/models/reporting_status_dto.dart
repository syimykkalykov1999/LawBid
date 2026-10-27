// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reporting_status_dto.g.dart';

@JsonSerializable()
class ReportingStatusDto {
  const ReportingStatusDto({
    required this.warnings,
    required this.suspendedUntil,
    required this.canAppeal,
    required this.appealStatus,
    required this.appealNote,
  });

  factory ReportingStatusDto.fromJson(Map<String, Object?> json) =>
      _$ReportingStatusDtoFromJson(json);

  final int warnings;
  final DateTime? suspendedUntil;
  final bool canAppeal;
  final String? appealStatus;
  final String? appealNote;

  Map<String, Object?> toJson() => _$ReportingStatusDtoToJson(this);
}
