// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'data_request_card_dto.dart';
import 'response_meta_dto.dart';

part 'data_request_card_envelope.g.dart';

@JsonSerializable()
class DataRequestCardEnvelope {
  const DataRequestCardEnvelope({required this.data, this.meta});

  factory DataRequestCardEnvelope.fromJson(Map<String, Object?> json) =>
      _$DataRequestCardEnvelopeFromJson(json);

  final DataRequestCardDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DataRequestCardEnvelopeToJson(this);
}
