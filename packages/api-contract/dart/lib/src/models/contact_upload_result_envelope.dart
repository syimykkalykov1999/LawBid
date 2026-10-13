// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'contact_upload_result_dto.dart';
import 'response_meta_dto.dart';

part 'contact_upload_result_envelope.g.dart';

@JsonSerializable()
class ContactUploadResultEnvelope {
  const ContactUploadResultEnvelope({required this.data, this.meta});

  factory ContactUploadResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$ContactUploadResultEnvelopeFromJson(json);

  final ContactUploadResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ContactUploadResultEnvelopeToJson(this);
}
