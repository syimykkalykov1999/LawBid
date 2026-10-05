// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'support_macro_dto.dart';

part 'support_macro_envelope.g.dart';

@JsonSerializable()
class SupportMacroEnvelope {
  const SupportMacroEnvelope({required this.data, this.meta});

  factory SupportMacroEnvelope.fromJson(Map<String, Object?> json) =>
      _$SupportMacroEnvelopeFromJson(json);

  final SupportMacroDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SupportMacroEnvelopeToJson(this);
}
