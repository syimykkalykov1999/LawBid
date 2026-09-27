// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'identifier_dto.dart';
import 'response_meta_dto.dart';

part 'identifier_list_envelope.g.dart';

@JsonSerializable()
class IdentifierListEnvelope {
  const IdentifierListEnvelope({required this.data, this.meta});

  factory IdentifierListEnvelope.fromJson(Map<String, Object?> json) =>
      _$IdentifierListEnvelopeFromJson(json);

  final List<IdentifierDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$IdentifierListEnvelopeToJson(this);
}
