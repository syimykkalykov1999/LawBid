// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'practice_match_dto.dart';
import 'response_meta_dto.dart';

part 'practice_match_list_envelope.g.dart';

@JsonSerializable()
class PracticeMatchListEnvelope {
  const PracticeMatchListEnvelope({required this.data, this.meta});

  factory PracticeMatchListEnvelope.fromJson(Map<String, Object?> json) =>
      _$PracticeMatchListEnvelopeFromJson(json);

  final List<PracticeMatchDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PracticeMatchListEnvelopeToJson(this);
}
