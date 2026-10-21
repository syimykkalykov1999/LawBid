// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'gift_dto.dart';
import 'response_meta_dto.dart';

part 'gift_list_envelope.g.dart';

@JsonSerializable()
class GiftListEnvelope {
  const GiftListEnvelope({required this.data, this.meta});

  factory GiftListEnvelope.fromJson(Map<String, Object?> json) =>
      _$GiftListEnvelopeFromJson(json);

  final List<GiftDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$GiftListEnvelopeToJson(this);
}
