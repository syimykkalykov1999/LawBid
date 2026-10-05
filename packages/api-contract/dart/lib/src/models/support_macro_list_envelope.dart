// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'support_macro_dto.dart';

part 'support_macro_list_envelope.g.dart';

@JsonSerializable()
class SupportMacroListEnvelope {
  const SupportMacroListEnvelope({required this.data, this.meta});

  factory SupportMacroListEnvelope.fromJson(Map<String, Object?> json) =>
      _$SupportMacroListEnvelopeFromJson(json);

  final List<SupportMacroDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SupportMacroListEnvelopeToJson(this);
}
