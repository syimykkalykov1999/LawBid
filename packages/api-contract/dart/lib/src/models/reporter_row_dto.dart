// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reporter_history_entry_dto.dart';

part 'reporter_row_dto.g.dart';

@JsonSerializable()
class ReporterRowDto {
  const ReporterRowDto({
    required this.userId,
    required this.name,
    required this.accountCreatedAt,
    required this.verifiedAttorney,
    required this.total,
    required this.upheld,
    required this.rejected,
    required this.pending,
    required this.warnings,
    required this.suspendedUntil,
    required this.suspensions,
    required this.appealStatus,
    required this.appealMessage,
    required this.lastReason,
    required this.history,
  });

  factory ReporterRowDto.fromJson(Map<String, Object?> json) =>
      _$ReporterRowDtoFromJson(json);

  final String userId;
  final String? name;
  final DateTime accountCreatedAt;
  final bool verifiedAttorney;
  final int total;
  final int upheld;
  final int rejected;
  final int pending;
  final int warnings;
  final DateTime? suspendedUntil;
  final int suspensions;
  final String? appealStatus;
  final String? appealMessage;
  final String? lastReason;
  final List<ReporterHistoryEntryDto> history;

  Map<String, Object?> toJson() => _$ReporterRowDtoToJson(this);
}
