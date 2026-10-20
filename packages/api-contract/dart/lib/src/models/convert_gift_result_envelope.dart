// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'convert_gift_result_dto.dart';
import 'response_meta_dto.dart';

part 'convert_gift_result_envelope.g.dart';

@JsonSerializable()
class ConvertGiftResultEnvelope {
  const ConvertGiftResultEnvelope({required this.data, this.meta});

  factory ConvertGiftResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$ConvertGiftResultEnvelopeFromJson(json);

  final ConvertGiftResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ConvertGiftResultEnvelopeToJson(this);
}
