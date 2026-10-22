// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum PendingLegalDocumentDtoLocale {
  @JsonValue('en')
  en('en'),
  @JsonValue('ru')
  ru('ru'),
  @JsonValue('es')
  es('es'),
  @JsonValue('fr')
  fr('fr'),
  @JsonValue('de')
  de('de'),
  @JsonValue('it')
  it('it'),
  @JsonValue('pt')
  pt('pt'),
  @JsonValue('nl')
  nl('nl'),
  @JsonValue('pl')
  pl('pl'),
  @JsonValue('uk')
  uk('uk'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const PendingLegalDocumentDtoLocale(this.json);

  factory PendingLegalDocumentDtoLocale.fromJson(String json) =>
      values.firstWhere((e) => e.json == json, orElse: () => $unknown);

  final String? json;
  String toJson() {
    final value = json;
    if (value == null) {
      throw StateError(
        'Cannot convert enum value with null JSON representation to String. '
        'This usually happens for \$unknown or @JsonValue(null) entries.',
      );
    }
    return value as String;
  }

  @override
  String toString() => json?.toString() ?? super.toString();

  /// Returns all defined enum values excluding the $unknown value.
  static List<PendingLegalDocumentDtoLocale> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
