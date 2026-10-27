// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'minor_row_dto.g.dart';

@JsonSerializable()
class MinorRowDto {
  const MinorRowDto({
    required this.userId,
    required this.status,
    required this.birthDate,
    required this.flaggedAt,
    required this.flagReason,
    required this.attestedAt,
    required this.textVersion,
  });

  factory MinorRowDto.fromJson(Map<String, Object?> json) =>
      _$MinorRowDtoFromJson(json);

  final String userId;

  /// attested | flagged | deleted
  final String status;
  final String? birthDate;
  final String? flaggedAt;
  final String? flagReason;
  final String attestedAt;
  final String textVersion;

  Map<String, Object?> toJson() => _$MinorRowDtoToJson(this);
}
