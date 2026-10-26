// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'trust_requirements_dto.g.dart';

@JsonSerializable()
class TrustRequirementsDto {
  const TrustRequirementsDto({
    required this.registry,
    required this.identity,
    required this.documents,
  });

  factory TrustRequirementsDto.fromJson(Map<String, Object?> json) =>
      _$TrustRequirementsDtoFromJson(json);

  /// Bar number matched the state registry.
  final bool registry;

  /// Stripe KYC with the attorney as the verified person, or firm link.
  final bool identity;

  /// Staff checked ID + selfie + bar card.
  final bool documents;

  Map<String, Object?> toJson() => _$TrustRequirementsDtoToJson(this);
}
