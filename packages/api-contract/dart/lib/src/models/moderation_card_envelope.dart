// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'moderation_card_dto.dart';
import 'response_meta_dto.dart';

part 'moderation_card_envelope.g.dart';

@JsonSerializable()
class ModerationCardEnvelope {
  const ModerationCardEnvelope({required this.data, this.meta});

  factory ModerationCardEnvelope.fromJson(Map<String, Object?> json) =>
      _$ModerationCardEnvelopeFromJson(json);

  final ModerationCardDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ModerationCardEnvelopeToJson(this);
}
