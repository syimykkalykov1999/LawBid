// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'phone_changed_dto.dart';
import 'response_meta_dto.dart';

part 'phone_changed_envelope.g.dart';

@JsonSerializable()
class PhoneChangedEnvelope {
  const PhoneChangedEnvelope({required this.data, this.meta});

  factory PhoneChangedEnvelope.fromJson(Map<String, Object?> json) =>
      _$PhoneChangedEnvelopeFromJson(json);

  final PhoneChangedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PhoneChangedEnvelopeToJson(this);
}
