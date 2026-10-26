// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'message_translation_dto.dart';
import 'response_meta_dto.dart';

part 'message_translation_envelope.g.dart';

@JsonSerializable()
class MessageTranslationEnvelope {
  const MessageTranslationEnvelope({required this.data, this.meta});

  factory MessageTranslationEnvelope.fromJson(Map<String, Object?> json) =>
      _$MessageTranslationEnvelopeFromJson(json);

  final MessageTranslationDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MessageTranslationEnvelopeToJson(this);
}
