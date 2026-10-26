// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'transparency_report_dto.g.dart';

@JsonSerializable()
class TransparencyReportDto {
  const TransparencyReportDto({
    required this.year,
    required this.total,
    required this.byType,
    required this.byStatus,
    required this.byCountry,
    required this.accountsAffected,
    required this.withGagOrder,
    required this.usersNotified,
    required this.holdsPlaced,
    required this.productionsMade,
  });

  factory TransparencyReportDto.fromJson(Map<String, Object?> json) =>
      _$TransparencyReportDtoFromJson(json);

  final num year;
  final num total;
  final Map<String, num> byType;
  final Map<String, num> byStatus;
  final Map<String, num> byCountry;
  final num accountsAffected;
  final num withGagOrder;
  final num usersNotified;
  final num holdsPlaced;
  final num productionsMade;

  Map<String, Object?> toJson() => _$TransparencyReportDtoToJson(this);
}
