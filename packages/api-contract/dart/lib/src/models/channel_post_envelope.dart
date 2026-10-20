// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'channel_post_dto.dart';
import 'response_meta_dto.dart';

part 'channel_post_envelope.g.dart';

@JsonSerializable()
class ChannelPostEnvelope {
  const ChannelPostEnvelope({required this.data, this.meta});

  factory ChannelPostEnvelope.fromJson(Map<String, Object?> json) =>
      _$ChannelPostEnvelopeFromJson(json);

  final ChannelPostDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ChannelPostEnvelopeToJson(this);
}
