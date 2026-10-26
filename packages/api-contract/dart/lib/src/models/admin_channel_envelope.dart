// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_channel_dto.dart';
import 'response_meta_dto.dart';

part 'admin_channel_envelope.g.dart';

@JsonSerializable()
class AdminChannelEnvelope {
  const AdminChannelEnvelope({required this.data, this.meta});

  factory AdminChannelEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminChannelEnvelopeFromJson(json);

  final AdminChannelDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminChannelEnvelopeToJson(this);
}
