// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'my_entitlements_dto.dart';
import 'response_meta_dto.dart';

part 'my_entitlements_envelope.g.dart';

@JsonSerializable()
class MyEntitlementsEnvelope {
  const MyEntitlementsEnvelope({required this.data, this.meta});

  factory MyEntitlementsEnvelope.fromJson(Map<String, Object?> json) =>
      _$MyEntitlementsEnvelopeFromJson(json);

  final MyEntitlementsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MyEntitlementsEnvelopeToJson(this);
}
