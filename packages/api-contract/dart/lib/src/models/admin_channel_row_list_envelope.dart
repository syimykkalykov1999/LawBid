// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_channel_row_dto.dart';
import 'response_meta_dto.dart';

part 'admin_channel_row_list_envelope.g.dart';

@JsonSerializable()
class AdminChannelRowListEnvelope {
  const AdminChannelRowListEnvelope({required this.data, this.meta});

  factory AdminChannelRowListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AdminChannelRowListEnvelopeFromJson(json);

  final List<AdminChannelRowDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AdminChannelRowListEnvelopeToJson(this);
}
