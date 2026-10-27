// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'my_leases_dto.dart';
import 'response_meta_dto.dart';

part 'my_leases_envelope.g.dart';

@JsonSerializable()
class MyLeasesEnvelope {
  const MyLeasesEnvelope({required this.data, this.meta});

  factory MyLeasesEnvelope.fromJson(Map<String, Object?> json) =>
      _$MyLeasesEnvelopeFromJson(json);

  final MyLeasesDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MyLeasesEnvelopeToJson(this);
}
