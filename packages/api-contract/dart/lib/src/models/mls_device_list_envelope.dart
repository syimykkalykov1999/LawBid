// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'mls_device_dto.dart';
import 'response_meta_dto.dart';

part 'mls_device_list_envelope.g.dart';

@JsonSerializable()
class MlsDeviceListEnvelope {
  const MlsDeviceListEnvelope({required this.data, this.meta});

  factory MlsDeviceListEnvelope.fromJson(Map<String, Object?> json) =>
      _$MlsDeviceListEnvelopeFromJson(json);

  final List<MlsDeviceDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MlsDeviceListEnvelopeToJson(this);
}
