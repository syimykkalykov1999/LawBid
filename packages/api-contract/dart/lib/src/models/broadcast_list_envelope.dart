// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'broadcast_dto.dart';
import 'response_meta_dto.dart';

part 'broadcast_list_envelope.g.dart';

@JsonSerializable()
class BroadcastListEnvelope {
  const BroadcastListEnvelope({required this.data, this.meta});

  factory BroadcastListEnvelope.fromJson(Map<String, Object?> json) =>
      _$BroadcastListEnvelopeFromJson(json);

  final List<BroadcastDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BroadcastListEnvelopeToJson(this);
}
