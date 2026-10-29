// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'phone_status_result_dto.dart';
import 'response_meta_dto.dart';

part 'phone_status_result_envelope.g.dart';

@JsonSerializable()
class PhoneStatusResultEnvelope {
  const PhoneStatusResultEnvelope({
    required this.data,
    this.meta,
  });
  
  factory PhoneStatusResultEnvelope.fromJson(Map<String, Object?> json) => _$PhoneStatusResultEnvelopeFromJson(json);
  
  final PhoneStatusResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PhoneStatusResultEnvelopeToJson(this);
}
