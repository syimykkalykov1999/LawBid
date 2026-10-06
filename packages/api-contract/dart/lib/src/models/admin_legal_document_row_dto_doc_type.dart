// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

@JsonEnum()
enum AdminLegalDocumentRowDtoDocType {
  @JsonValue('terms')
  terms('terms'),
  @JsonValue('privacy')
  privacy('privacy'),
  @JsonValue('attorney_agreement')
  attorneyAgreement('attorney_agreement'),
  @JsonValue('client_agreement')
  clientAgreement('client_agreement'),
  @JsonValue('eula')
  eula('eula'),
  @JsonValue('disclaimer')
  disclaimer('disclaimer'),
  @JsonValue('client_contact_sharing')
  clientContactSharing('client_contact_sharing'),
  @JsonValue('refund')
  refund('refund'),
  @JsonValue('cookies')
  cookies('cookies'),
  @JsonValue('third_party_services')
  thirdPartyServices('third_party_services'),
  @JsonValue('partner_terms')
  partnerTerms('partner_terms'),
  @JsonValue('dmca_policy')
  dmcaPolicy('dmca_policy'),

  /// Default value for all unparsed values, allows backward compatibility when adding new values on the backend.
  $unknown(null);

  const AdminLegalDocumentRowDtoDocType(this.json);

  factory AdminLegalDocumentRowDtoDocType.fromJson(String json) =>
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
  static List<AdminLegalDocumentRowDtoDocType> get $valuesDefined =>
      values.where((value) => value != $unknown).toList();
}
