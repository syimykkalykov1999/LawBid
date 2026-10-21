// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'legal_lookup_hit_dto.dart';
import 'response_meta_dto.dart';

part 'legal_lookup_hit_list_envelope.g.dart';

@JsonSerializable()
class LegalLookupHitListEnvelope {
  const LegalLookupHitListEnvelope({required this.data, this.meta});

  factory LegalLookupHitListEnvelope.fromJson(Map<String, Object?> json) =>
      _$LegalLookupHitListEnvelopeFromJson(json);

  final List<LegalLookupHitDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LegalLookupHitListEnvelopeToJson(this);
}
