// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'reco_qa_status_dto.dart';
import 'response_meta_dto.dart';

part 'reco_qa_status_envelope.g.dart';

@JsonSerializable()
class RecoQaStatusEnvelope {
  const RecoQaStatusEnvelope({required this.data, this.meta});

  factory RecoQaStatusEnvelope.fromJson(Map<String, Object?> json) =>
      _$RecoQaStatusEnvelopeFromJson(json);

  final RecoQaStatusDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$RecoQaStatusEnvelopeToJson(this);
}
