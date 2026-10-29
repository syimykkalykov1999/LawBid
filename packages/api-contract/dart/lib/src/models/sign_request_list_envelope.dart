// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'sign_request_dto.dart';

part 'sign_request_list_envelope.g.dart';

@JsonSerializable()
class SignRequestListEnvelope {
  const SignRequestListEnvelope({
    required this.data,
    this.meta,
  });
  
  factory SignRequestListEnvelope.fromJson(Map<String, Object?> json) => _$SignRequestListEnvelopeFromJson(json);
  
  final List<SignRequestDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SignRequestListEnvelopeToJson(this);
}
