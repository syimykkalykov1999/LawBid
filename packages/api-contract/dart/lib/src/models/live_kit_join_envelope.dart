// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'live_kit_join_dto.dart';
import 'response_meta_dto.dart';

part 'live_kit_join_envelope.g.dart';

@JsonSerializable()
class LiveKitJoinEnvelope {
  const LiveKitJoinEnvelope({required this.data, this.meta});

  factory LiveKitJoinEnvelope.fromJson(Map<String, Object?> json) =>
      _$LiveKitJoinEnvelopeFromJson(json);

  final LiveKitJoinDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$LiveKitJoinEnvelopeToJson(this);
}
