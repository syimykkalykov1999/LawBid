// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'practice_area_category_dto.dart';
import 'response_meta_dto.dart';

part 'practice_area_category_list_envelope.g.dart';

@JsonSerializable()
class PracticeAreaCategoryListEnvelope {
  const PracticeAreaCategoryListEnvelope({required this.data, this.meta});

  factory PracticeAreaCategoryListEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$PracticeAreaCategoryListEnvelopeFromJson(json);

  final List<PracticeAreaCategoryDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$PracticeAreaCategoryListEnvelopeToJson(this);
}
