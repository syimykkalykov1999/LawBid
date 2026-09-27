// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'consents_saved_dto.dart';
import 'response_meta_dto.dart';

part 'consents_saved_envelope.g.dart';

@JsonSerializable()
class ConsentsSavedEnvelope {
  const ConsentsSavedEnvelope({required this.data, this.meta});

  factory ConsentsSavedEnvelope.fromJson(Map<String, Object?> json) =>
      _$ConsentsSavedEnvelopeFromJson(json);

  final ConsentsSavedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ConsentsSavedEnvelopeToJson(this);
}
