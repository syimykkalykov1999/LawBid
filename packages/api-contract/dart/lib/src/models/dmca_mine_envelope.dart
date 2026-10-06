// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'dmca_mine_dto.dart';
import 'response_meta_dto.dart';

part 'dmca_mine_envelope.g.dart';

@JsonSerializable()
class DmcaMineEnvelope {
  const DmcaMineEnvelope({required this.data, this.meta});

  factory DmcaMineEnvelope.fromJson(Map<String, Object?> json) =>
      _$DmcaMineEnvelopeFromJson(json);

  final DmcaMineDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DmcaMineEnvelopeToJson(this);
}
