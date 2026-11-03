// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'quick_reply_dto.dart';
import 'response_meta_dto.dart';

part 'quick_reply_envelope.g.dart';

@JsonSerializable()
class QuickReplyEnvelope {
  const QuickReplyEnvelope({required this.data, this.meta});

  factory QuickReplyEnvelope.fromJson(Map<String, Object?> json) =>
      _$QuickReplyEnvelopeFromJson(json);

  final QuickReplyDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$QuickReplyEnvelopeToJson(this);
}
