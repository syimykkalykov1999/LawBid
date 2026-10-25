// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'strike_dto.dart';

part 'strike_list_envelope.g.dart';

@JsonSerializable()
class StrikeListEnvelope {
  const StrikeListEnvelope({required this.data, this.meta});

  factory StrikeListEnvelope.fromJson(Map<String, Object?> json) =>
      _$StrikeListEnvelopeFromJson(json);

  final List<StrikeDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StrikeListEnvelopeToJson(this);
}
