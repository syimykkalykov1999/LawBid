// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'time_entry_dto.g.dart';

@JsonSerializable()
class TimeEntryDto {
  const TimeEntryDto({
    required this.id,
    required this.workedOn,
    required this.minutes,
    required this.runningSince,
    required this.note,
    required this.rateCents,
    required this.cents,
    required this.invoiceId,
  });

  factory TimeEntryDto.fromJson(Map<String, Object?> json) =>
      _$TimeEntryDtoFromJson(json);

  final String id;
  final DateTime workedOn;

  /// Minutes counted (a running timer: before this run).
  final num minutes;
  final DateTime? runningSince;
  final String note;
  final num rateCents;

  /// Price of the counted minutes.
  final num cents;
  final String? invoiceId;

  Map<String, Object?> toJson() => _$TimeEntryDtoToJson(this);
}
