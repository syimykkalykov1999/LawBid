// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'public_review_dto.dart';
import 'response_meta_dto.dart';

part 'public_review_list_envelope.g.dart';

@JsonSerializable()
class PublicReviewListEnvelope {
  const PublicReviewListEnvelope({required this.data, this.meta});

  factory PublicReviewListEnvelope.fromJson(Map<String, Object?> json) =>
      _$PublicReviewListEnvelopeFromJson(json);

  final List<PublicReviewDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PublicReviewListEnvelopeToJson(this);
}
