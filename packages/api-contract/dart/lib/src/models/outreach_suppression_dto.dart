// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'outreach_suppression_kind.dart';

part 'outreach_suppression_dto.g.dart';

@JsonSerializable()
class OutreachSuppressionDto {
  const OutreachSuppressionDto({
    required this.kind,
    required this.value,
    required this.note,
    required this.createdAt,
  });

  factory OutreachSuppressionDto.fromJson(Map<String, Object?> json) =>
      _$OutreachSuppressionDtoFromJson(json);

  final OutreachSuppressionKind kind;

  /// Masked except the last 4 characters.
  final String value;
  final String? note;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$OutreachSuppressionDtoToJson(this);
}
