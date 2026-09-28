// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'selected_practice_area_dto.dart';

part 'selected_practice_area_list_envelope.g.dart';

@JsonSerializable()
class SelectedPracticeAreaListEnvelope {
  const SelectedPracticeAreaListEnvelope({required this.data, this.meta});

  factory SelectedPracticeAreaListEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$SelectedPracticeAreaListEnvelopeFromJson(json);

  final List<SelectedPracticeAreaDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$SelectedPracticeAreaListEnvelopeToJson(this);
}
