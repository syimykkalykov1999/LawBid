// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'channel_dto.dart';
import 'response_meta_dto.dart';

part 'channel_list_envelope.g.dart';

@JsonSerializable()
class ChannelListEnvelope {
  const ChannelListEnvelope({required this.data, this.meta});

  factory ChannelListEnvelope.fromJson(Map<String, Object?> json) =>
      _$ChannelListEnvelopeFromJson(json);

  final List<ChannelDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ChannelListEnvelopeToJson(this);
}
