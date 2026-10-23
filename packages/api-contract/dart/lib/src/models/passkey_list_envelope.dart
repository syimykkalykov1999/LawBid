// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'passkey_list_dto.dart';
import 'response_meta_dto.dart';

part 'passkey_list_envelope.g.dart';

@JsonSerializable()
class PasskeyListEnvelope {
  const PasskeyListEnvelope({required this.data, this.meta});

  factory PasskeyListEnvelope.fromJson(Map<String, Object?> json) =>
      _$PasskeyListEnvelopeFromJson(json);

  final PasskeyListDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PasskeyListEnvelopeToJson(this);
}
