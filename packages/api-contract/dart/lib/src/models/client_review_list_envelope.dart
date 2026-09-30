// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_review_dto.dart';
import 'response_meta_dto.dart';

part 'client_review_list_envelope.g.dart';

@JsonSerializable()
class ClientReviewListEnvelope {
  const ClientReviewListEnvelope({required this.data, this.meta});

  factory ClientReviewListEnvelope.fromJson(Map<String, Object?> json) =>
      _$ClientReviewListEnvelopeFromJson(json);

  final List<ClientReviewDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ClientReviewListEnvelopeToJson(this);
}
