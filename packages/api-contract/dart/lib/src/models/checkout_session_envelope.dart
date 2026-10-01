// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'checkout_session_dto.dart';
import 'response_meta_dto.dart';

part 'checkout_session_envelope.g.dart';

@JsonSerializable()
class CheckoutSessionEnvelope {
  const CheckoutSessionEnvelope({required this.data, this.meta});

  factory CheckoutSessionEnvelope.fromJson(Map<String, Object?> json) =>
      _$CheckoutSessionEnvelopeFromJson(json);

  final CheckoutSessionDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CheckoutSessionEnvelopeToJson(this);
}
