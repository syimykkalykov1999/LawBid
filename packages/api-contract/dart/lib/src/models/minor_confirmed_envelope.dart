// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'minor_confirmed_dto.dart';
import 'response_meta_dto.dart';

part 'minor_confirmed_envelope.g.dart';

@JsonSerializable()
class MinorConfirmedEnvelope {
  const MinorConfirmedEnvelope({required this.data, this.meta});

  factory MinorConfirmedEnvelope.fromJson(Map<String, Object?> json) =>
      _$MinorConfirmedEnvelopeFromJson(json);

  final MinorConfirmedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MinorConfirmedEnvelopeToJson(this);
}
