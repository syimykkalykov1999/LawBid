// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'license_decision_dto_decision.dart';
import 'license_decision_dto_rejection_code.dart';

part 'license_decision_dto.g.dart';

@JsonSerializable()
class LicenseDecisionDto {
  const LicenseDecisionDto({
    required this.decision,
    this.rejectionCode,
    this.note,
  });

  factory LicenseDecisionDto.fromJson(Map<String, Object?> json) =>
      _$LicenseDecisionDtoFromJson(json);

  final LicenseDecisionDtoDecision decision;

  /// Required when decision = rejected.
  final LicenseDecisionDtoRejectionCode? rejectionCode;
  final String? note;

  Map<String, Object?> toJson() => _$LicenseDecisionDtoToJson(this);
}
