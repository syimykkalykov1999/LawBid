// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'demo_status_dto.g.dart';

@JsonSerializable()
class DemoStatusDto {
  const DemoStatusDto({
    required this.ready,
    required this.reason,
    required this.databaseName,
    required this.accounts,
    required this.lastResetAt,
    required this.lastSweepAt,
    required this.migrationsApplied,
    required this.migrationsPending,
    required this.seedCounts,
  });

  factory DemoStatusDto.fromJson(Map<String, Object?> json) =>
      _$DemoStatusDtoFromJson(json);

  final bool ready;
  final String? reason;
  final String? databaseName;
  final num accounts;
  final DateTime? lastResetAt;
  final DateTime? lastSweepAt;
  final num migrationsApplied;
  final num migrationsPending;

  /// What the last seed created (users, cases, posts …).
  final Map<String, num>? seedCounts;

  Map<String, Object?> toJson() => _$DemoStatusDtoToJson(this);
}
