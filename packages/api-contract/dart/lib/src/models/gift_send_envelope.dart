// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'gift_send_dto.dart';
import 'response_meta_dto.dart';

part 'gift_send_envelope.g.dart';

@JsonSerializable()
class GiftSendEnvelope {
  const GiftSendEnvelope({required this.data, this.meta});

  factory GiftSendEnvelope.fromJson(Map<String, Object?> json) =>
      _$GiftSendEnvelopeFromJson(json);

  final GiftSendDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GiftSendEnvelopeToJson(this);
}
