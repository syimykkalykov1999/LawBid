// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'capacity_dto.dart';
import 'containers_dto.dart';
import 'economy_event_dto.dart';
import 'economy_figures_dto.dart';
import 'economy_report_dto_guard.dart';
import 'economy_settings_dto.dart';

part 'economy_report_dto.g.dart';

@JsonSerializable()
class EconomyReportDto {
  const EconomyReportDto({
    required this.enabled,
    required this.guard,
    required this.figures,
    required this.settings,
    required this.containers,
    required this.capacity,
    required this.events,
    this.since,
  });

  factory EconomyReportDto.fromJson(Map<String, Object?> json) =>
      _$EconomyReportDtoFromJson(json);

  /// The economy_guard flag.
  final bool enabled;
  final EconomyReportDtoGuard guard;
  final String? since;
  final EconomyFiguresDto figures;
  final EconomySettingsDto settings;
  final ContainersDto containers;
  final CapacityDto capacity;
  final List<EconomyEventDto> events;

  Map<String, Object?> toJson() => _$EconomyReportDtoToJson(this);
}
