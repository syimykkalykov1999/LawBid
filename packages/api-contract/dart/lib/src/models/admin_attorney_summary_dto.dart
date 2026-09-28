// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'verification_status.dart';

part 'admin_attorney_summary_dto.g.dart';

@JsonSerializable()
class AdminAttorneySummaryDto {
  const AdminAttorneySummaryDto({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.username,
    required this.verificationStatus,
  });

  factory AdminAttorneySummaryDto.fromJson(Map<String, Object?> json) =>
      _$AdminAttorneySummaryDtoFromJson(json);

  final String id;
  final String? firstName;
  final String? lastName;
  final String username;
  final VerificationStatus verificationStatus;

  Map<String, Object?> toJson() => _$AdminAttorneySummaryDtoToJson(this);
}
