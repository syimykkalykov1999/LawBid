// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'join_partner_dto.g.dart';

@JsonSerializable()
class JoinPartnerDto {
  const JoinPartnerDto({required this.termsAccepted});

  factory JoinPartnerDto.fromJson(Map<String, Object?> json) =>
      _$JoinPartnerDtoFromJson(json);

  /// The partner read and accepts the partner rules (GET /legal/settings texts.partnerTerms). Must be true.
  final bool termsAccepted;

  Map<String, Object?> toJson() => _$JoinPartnerDtoToJson(this);
}
