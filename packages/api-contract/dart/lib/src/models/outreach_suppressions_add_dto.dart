// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'outreach_suppressions_add_dto.g.dart';

@JsonSerializable()
class OutreachSuppressionsAddDto {
  const OutreachSuppressionsAddDto({required this.values, this.note});

  factory OutreachSuppressionsAddDto.fromJson(Map<String, Object?> json) =>
      _$OutreachSuppressionsAddDtoFromJson(json);

  /// Phones or e-mails, one per item (normalized server-side).
  final List<String> values;
  final String? note;

  Map<String, Object?> toJson() => _$OutreachSuppressionsAddDtoToJson(this);
}
