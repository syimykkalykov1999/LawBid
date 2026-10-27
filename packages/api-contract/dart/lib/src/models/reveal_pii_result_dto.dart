// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reveal_pii_result_dto_field.dart';

part 'reveal_pii_result_dto.g.dart';

@JsonSerializable()
class RevealPiiResultDto {
  const RevealPiiResultDto({
    required this.field,
    required this.value,
    required this.remainingToday,
  });

  factory RevealPiiResultDto.fromJson(Map<String, Object?> json) =>
      _$RevealPiiResultDtoFromJson(json);

  final RevealPiiResultDtoField field;

  /// The full value. Shown once; not stored.
  final String value;

  /// Reveals left today (null = no daily limit for this admin).
  final num? remainingToday;

  Map<String, Object?> toJson() => _$RevealPiiResultDtoToJson(this);
}
