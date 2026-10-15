// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'practice_match_dto.g.dart';

@JsonSerializable()
class PracticeMatchDto {
  const PracticeMatchDto({
    required this.code,
    required this.nameEn,
    required this.hit,
  });

  factory PracticeMatchDto.fromJson(Map<String, Object?> json) =>
      _$PracticeMatchDtoFromJson(json);

  /// practice code, e.g. family_law.divorce
  final String code;
  final String nameEn;

  /// the word that matched when it is not the English name
  final String? hit;

  Map<String, Object?> toJson() => _$PracticeMatchDtoToJson(this);
}
