// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'passkey_removed_dto.dart';
import 'response_meta_dto.dart';

part 'passkey_removed_envelope.g.dart';

@JsonSerializable()
class PasskeyRemovedEnvelope {
  const PasskeyRemovedEnvelope({
    required this.data,
    this.meta,
  });
  
  factory PasskeyRemovedEnvelope.fromJson(Map<String, Object?> json) => _$PasskeyRemovedEnvelopeFromJson(json);
  
  final PasskeyRemovedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PasskeyRemovedEnvelopeToJson(this);
}
