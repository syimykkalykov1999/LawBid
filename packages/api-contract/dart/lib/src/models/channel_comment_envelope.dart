// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'channel_comment_dto.dart';
import 'response_meta_dto.dart';

part 'channel_comment_envelope.g.dart';

@JsonSerializable()
class ChannelCommentEnvelope {
  const ChannelCommentEnvelope({required this.data, this.meta});

  factory ChannelCommentEnvelope.fromJson(Map<String, Object?> json) =>
      _$ChannelCommentEnvelopeFromJson(json);

  final ChannelCommentDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ChannelCommentEnvelopeToJson(this);
}
