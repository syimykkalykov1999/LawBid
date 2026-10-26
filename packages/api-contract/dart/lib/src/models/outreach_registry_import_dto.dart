// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_import_mode.dart';
import 'outreach_registry_state.dart';

part 'outreach_registry_import_dto.g.dart';

@JsonSerializable()
class OutreachRegistryImportDto {
  const OutreachRegistryImportDto({
    required this.state,
    this.limit = 100,
    this.offset = 0,
    this.mode = OutreachImportMode.dryRun,
    this.county,
    this.city,
    this.admittedFrom,
    this.partnerId,
  });

  factory OutreachRegistryImportDto.fromJson(Map<String, Object?> json) =>
      _$OutreachRegistryImportDtoFromJson(json);

  /// Only New York publishes a free registry so far.
  final OutreachRegistryState state;

  /// County, e.g. "New York", "Kings".
  final String? county;
  final String? city;

  /// Admitted in or after this year.
  final num? admittedFrom;
  final num limit;

  /// Skip this many rows (next page).
  final num offset;
  final OutreachImportMode mode;
  final String? partnerId;

  Map<String, Object?> toJson() => _$OutreachRegistryImportDtoToJson(this);
}
