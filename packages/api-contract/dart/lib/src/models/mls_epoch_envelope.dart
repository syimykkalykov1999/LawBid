// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'mls_epoch_dto.dart';
import 'response_meta_dto.dart';

part 'mls_epoch_envelope.g.dart';

@JsonSerializable()
class MlsEpochEnvelope {
  const MlsEpochEnvelope({required this.data, this.meta});

  factory MlsEpochEnvelope.fromJson(Map<String, Object?> json) =>
      _$MlsEpochEnvelopeFromJson(json);

  final MlsEpochDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MlsEpochEnvelopeToJson(this);
}
