// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'history_practice_area_dto.g.dart';

@JsonSerializable()
class HistoryPracticeAreaDto {
  const HistoryPracticeAreaDto({
    required this.id,
    required this.code,
    required this.i18nKey,
    required this.nameEn,
  });

  factory HistoryPracticeAreaDto.fromJson(Map<String, Object?> json) =>
      _$HistoryPracticeAreaDtoFromJson(json);

  final String id;
  final String code;
  final String i18nKey;
  final String nameEn;

  Map<String, Object?> toJson() => _$HistoryPracticeAreaDtoToJson(this);
}
