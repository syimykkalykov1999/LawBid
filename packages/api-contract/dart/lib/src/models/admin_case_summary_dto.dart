// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_party_dto.dart';

part 'admin_case_summary_dto.g.dart';

@JsonSerializable()
class AdminCaseSummaryDto {
  const AdminCaseSummaryDto({
    required this.id,
    required this.title,
    required this.status,
    required this.stateCode,
    required this.createdAt,
    required this.client,
    required this.attorney,
  });

  factory AdminCaseSummaryDto.fromJson(Map<String, Object?> json) =>
      _$AdminCaseSummaryDtoFromJson(json);

  final String id;
  final String title;
  final String status;
  final String stateCode;
  final DateTime createdAt;
  final AdminPartyDto? client;

  /// Attorney of the accepted bid.
  final AdminPartyDto? attorney;

  Map<String, Object?> toJson() => _$AdminCaseSummaryDtoToJson(this);
}
