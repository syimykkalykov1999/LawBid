// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'review_me_dto.dart';

part 'review_me_envelope.g.dart';

@JsonSerializable()
class ReviewMeEnvelope {
  const ReviewMeEnvelope({required this.data, this.meta});

  factory ReviewMeEnvelope.fromJson(Map<String, Object?> json) =>
      _$ReviewMeEnvelopeFromJson(json);

  final ReviewMeDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$ReviewMeEnvelopeToJson(this);
}
