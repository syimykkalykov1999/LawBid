// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'message_dto.dart';
import 'response_meta_dto.dart';

part 'message_envelope.g.dart';

@JsonSerializable()
class MessageEnvelope {
  const MessageEnvelope({required this.data, this.meta});

  factory MessageEnvelope.fromJson(Map<String, Object?> json) =>
      _$MessageEnvelopeFromJson(json);

  final MessageDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MessageEnvelopeToJson(this);
}
