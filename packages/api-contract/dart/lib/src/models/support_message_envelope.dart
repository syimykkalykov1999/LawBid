// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'support_message_dto.dart';

part 'support_message_envelope.g.dart';

@JsonSerializable()
class SupportMessageEnvelope {
  const SupportMessageEnvelope({required this.data, this.meta});

  factory SupportMessageEnvelope.fromJson(Map<String, Object?> json) =>
      _$SupportMessageEnvelopeFromJson(json);

  final SupportMessageDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SupportMessageEnvelopeToJson(this);
}
