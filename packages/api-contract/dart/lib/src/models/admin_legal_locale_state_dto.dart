// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_legal_locale_state_dto_locale.dart';
import 'admin_legal_locale_state_dto_state.dart';

part 'admin_legal_locale_state_dto.g.dart';

@JsonSerializable()
class AdminLegalLocaleStateDto {
  const AdminLegalLocaleStateDto({
    required this.locale,
    required this.currentVersion,
    required this.publishedAt,
    required this.hasDraft,
    required this.draftUpdatedAt,
    required this.state,
  });

  factory AdminLegalLocaleStateDto.fromJson(Map<String, Object?> json) =>
      _$AdminLegalLocaleStateDtoFromJson(json);

  final AdminLegalLocaleStateDtoLocale locale;
  final String? currentVersion;
  final DateTime? publishedAt;
  final bool hasDraft;
  final DateTime? draftUpdatedAt;
  final AdminLegalLocaleStateDtoState state;

  Map<String, Object?> toJson() => _$AdminLegalLocaleStateDtoToJson(this);
}
