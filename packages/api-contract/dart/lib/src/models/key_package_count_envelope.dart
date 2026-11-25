// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'key_package_count_dto.dart';
import 'response_meta_dto.dart';

part 'key_package_count_envelope.g.dart';

@JsonSerializable()
class KeyPackageCountEnvelope {
  const KeyPackageCountEnvelope({required this.data, this.meta});

  factory KeyPackageCountEnvelope.fromJson(Map<String, Object?> json) =>
      _$KeyPackageCountEnvelopeFromJson(json);

  final KeyPackageCountDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$KeyPackageCountEnvelopeToJson(this);
}
