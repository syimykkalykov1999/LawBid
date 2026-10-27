// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'piecework_paid_diff_dto.g.dart';

@JsonSerializable()
class PieceworkPaidDiffDto {
  const PieceworkPaidDiffDto({required this.adminId, required this.deltaCents});

  factory PieceworkPaidDiffDto.fromJson(Map<String, Object?> json) =>
      _$PieceworkPaidDiffDtoFromJson(json);

  final String adminId;
  final int deltaCents;

  Map<String, Object?> toJson() => _$PieceworkPaidDiffDtoToJson(this);
}
