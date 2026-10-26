// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'moderation_notice_dto.dart';
import 'response_meta_dto.dart';

part 'moderation_notice_envelope.g.dart';

@JsonSerializable()
class ModerationNoticeEnvelope {
  const ModerationNoticeEnvelope({required this.data, this.meta});

  factory ModerationNoticeEnvelope.fromJson(Map<String, Object?> json) =>
      _$ModerationNoticeEnvelopeFromJson(json);

  final ModerationNoticeDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ModerationNoticeEnvelopeToJson(this);
}
