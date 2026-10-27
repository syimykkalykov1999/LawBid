// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'piecework_dispute_result_dto_accrual.dart';
import 'piecework_dispute_result_dto_status.dart';

part 'piecework_dispute_result_dto.g.dart';

@JsonSerializable()
class PieceworkDisputeResultDto {
  const PieceworkDisputeResultDto({
    required this.status,
    required this.accrual,
  });

  factory PieceworkDisputeResultDto.fromJson(Map<String, Object?> json) =>
      _$PieceworkDisputeResultDtoFromJson(json);

  final PieceworkDisputeResultDtoStatus status;

  /// What happened to the pending payroll accrual (paid: already paid out).
  final PieceworkDisputeResultDtoAccrual accrual;

  Map<String, Object?> toJson() => _$PieceworkDisputeResultDtoToJson(this);
}
