// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'identifier_linked_dto.dart';
import 'response_meta_dto.dart';

part 'identifier_linked_envelope.g.dart';

@JsonSerializable()
class IdentifierLinkedEnvelope {
  const IdentifierLinkedEnvelope({required this.data, this.meta});

  factory IdentifierLinkedEnvelope.fromJson(Map<String, Object?> json) =>
      _$IdentifierLinkedEnvelopeFromJson(json);

  final IdentifierLinkedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$IdentifierLinkedEnvelopeToJson(this);
}
