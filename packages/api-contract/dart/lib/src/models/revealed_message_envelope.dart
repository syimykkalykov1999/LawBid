// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'revealed_message_dto.dart';

part 'revealed_message_envelope.g.dart';

@JsonSerializable()
class RevealedMessageEnvelope {
  const RevealedMessageEnvelope({required this.data, this.meta});

  factory RevealedMessageEnvelope.fromJson(Map<String, Object?> json) =>
      _$RevealedMessageEnvelopeFromJson(json);

  final RevealedMessageDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$RevealedMessageEnvelopeToJson(this);
}
