// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'import_synonyms_result_dto.dart';
import 'response_meta_dto.dart';

part 'import_synonyms_result_envelope.g.dart';

@JsonSerializable()
class ImportSynonymsResultEnvelope {
  const ImportSynonymsResultEnvelope({required this.data, this.meta});

  factory ImportSynonymsResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$ImportSynonymsResultEnvelopeFromJson(json);

  final ImportSynonymsResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ImportSynonymsResultEnvelopeToJson(this);
}
