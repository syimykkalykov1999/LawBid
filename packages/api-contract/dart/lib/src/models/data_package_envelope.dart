// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'data_package_dto.dart';
import 'response_meta_dto.dart';

part 'data_package_envelope.g.dart';

@JsonSerializable()
class DataPackageEnvelope {
  const DataPackageEnvelope({required this.data, this.meta});

  factory DataPackageEnvelope.fromJson(Map<String, Object?> json) =>
      _$DataPackageEnvelopeFromJson(json);

  final DataPackageDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DataPackageEnvelopeToJson(this);
}
