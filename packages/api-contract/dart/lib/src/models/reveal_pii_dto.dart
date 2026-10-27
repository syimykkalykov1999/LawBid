// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reveal_pii_dto_field.dart';
import 'reveal_pii_dto_target_type.dart';

part 'reveal_pii_dto.g.dart';

@JsonSerializable()
class RevealPiiDto {
  const RevealPiiDto({
    required this.targetType,
    required this.targetId,
    required this.field,
  });

  factory RevealPiiDto.fromJson(Map<String, Object?> json) =>
      _$RevealPiiDtoFromJson(json);

  /// user (phone, email) or license (barNumber).
  final RevealPiiDtoTargetType targetType;
  final String targetId;
  final RevealPiiDtoField field;

  Map<String, Object?> toJson() => _$RevealPiiDtoToJson(this);
}
