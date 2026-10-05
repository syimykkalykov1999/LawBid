// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_waitlist_result_dto.dart';
import 'response_meta_dto.dart';

part 'country_waitlist_result_envelope.g.dart';

@JsonSerializable()
class CountryWaitlistResultEnvelope {
  const CountryWaitlistResultEnvelope({required this.data, this.meta});

  factory CountryWaitlistResultEnvelope.fromJson(Map<String, Object?> json) =>
      _$CountryWaitlistResultEnvelopeFromJson(json);

  final CountryWaitlistResultDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CountryWaitlistResultEnvelopeToJson(this);
}
