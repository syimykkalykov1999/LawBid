// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'spend_line_dto_covered_by.dart';
import 'spend_line_dto_key.dart';
import 'spend_line_dto_source.dart';

part 'spend_line_dto.g.dart';

@JsonSerializable()
class SpendLineDto {
  const SpendLineDto({
    required this.key,
    required this.monthToDateUsd,
    required this.projectedUsd,
    required this.source,
    this.coveredBy,
  });

  factory SpendLineDto.fromJson(Map<String, Object?> json) =>
      _$SpendLineDtoFromJson(json);

  final SpendLineDtoKey key;
  final num monthToDateUsd;
  final num projectedUsd;

  /// actual = read from the vendor; estimate = calls × price book.
  final SpendLineDtoSource source;

  /// The AWS bill already contains this line (not added twice).
  final SpendLineDtoCoveredBy? coveredBy;

  Map<String, Object?> toJson() => _$SpendLineDtoToJson(this);
}
