// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'outreach_suppressions_add_result_dto.g.dart';

@JsonSerializable()
class OutreachSuppressionsAddResultDto {
  const OutreachSuppressionsAddResultDto({
    required this.added,
    required this.leadsMarked,
    required this.invalid,
  });

  factory OutreachSuppressionsAddResultDto.fromJson(
    Map<String, Object?> json,
  ) => _$OutreachSuppressionsAddResultDtoFromJson(json);

  /// New stop-list entries.
  final num added;

  /// Existing leads marked do-not-contact.
  final num leadsMarked;

  /// Values that are neither a phone nor an email.
  final num invalid;

  Map<String, Object?> toJson() =>
      _$OutreachSuppressionsAddResultDtoToJson(this);
}
