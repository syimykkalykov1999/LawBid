// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'moderation_notice_dto.dart';
import 'response_meta_dto.dart';

part 'moderation_notice_list_envelope.g.dart';

@JsonSerializable()
class ModerationNoticeListEnvelope {
  const ModerationNoticeListEnvelope({required this.data, this.meta});

  factory ModerationNoticeListEnvelope.fromJson(Map<String, Object?> json) =>
      _$ModerationNoticeListEnvelopeFromJson(json);

  final List<ModerationNoticeDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ModerationNoticeListEnvelopeToJson(this);
}
