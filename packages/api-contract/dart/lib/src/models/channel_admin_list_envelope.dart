// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'channel_admin_dto.dart';
import 'response_meta_dto.dart';

part 'channel_admin_list_envelope.g.dart';

@JsonSerializable()
class ChannelAdminListEnvelope {
  const ChannelAdminListEnvelope({required this.data, this.meta});

  factory ChannelAdminListEnvelope.fromJson(Map<String, Object?> json) =>
      _$ChannelAdminListEnvelopeFromJson(json);

  final List<ChannelAdminDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ChannelAdminListEnvelopeToJson(this);
}
