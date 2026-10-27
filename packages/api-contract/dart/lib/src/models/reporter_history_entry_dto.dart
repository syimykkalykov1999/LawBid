// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reporter_history_entry_dto.g.dart';

@JsonSerializable()
class ReporterHistoryEntryDto {
  const ReporterHistoryEntryDto({
    required this.at,
    required this.kind,
    required this.reason,
  });

  factory ReporterHistoryEntryDto.fromJson(Map<String, Object?> json) =>
      _$ReporterHistoryEntryDtoFromJson(json);

  final DateTime at;
  final String kind;
  final String reason;

  Map<String, Object?> toJson() => _$ReporterHistoryEntryDtoToJson(this);
}
