// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'sanction_result_dto.g.dart';

@JsonSerializable()
class SanctionResultDto {
  const SanctionResultDto({
    required this.userId,
    required this.status,
    required this.revokedSessions,
    required this.archivedCases,
    required this.withdrawnBids,
  });

  factory SanctionResultDto.fromJson(Map<String, Object?> json) =>
      _$SanctionResultDtoFromJson(json);

  final String userId;
  final String status;

  /// Sessions revoked.
  final int revokedSessions;

  /// Client cases archived.
  final int archivedCases;

  /// Attorney bids withdrawn.
  final int withdrawnBids;

  Map<String, Object?> toJson() => _$SanctionResultDtoToJson(this);
}
