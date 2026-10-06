// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/accept_country_partner_contract_dto.dart';
import '../models/country_partner_contract_envelope.dart';
import '../models/country_partner_detail_envelope.dart';
import '../models/country_partner_portal_envelope.dart';
import '../models/country_partner_row_list_envelope.dart';
import '../models/create_country_partner_dto.dart';
import '../models/set_country_partner_payouts_dto.dart';
import '../models/set_country_partner_share_dto.dart';
import '../models/set_country_partner_status_dto.dart';
import '../models/update_country_partner_contract_dto.dart';
import '../models/update_country_partner_dto.dart';

part 'admin_country_partners_client.g.dart';

@RestApi()
abstract class AdminCountryPartnersClient {
  factory AdminCountryPartnersClient(Dio dio, {String? baseUrl}) =
      _AdminCountryPartnersClient;

  /// Every country partner
  @GET('/admin/country-partners')
  Future<CountryPartnerRowListEnvelope> listCountryPartners({
    @Extras() Map<String, dynamic>? extras,
  });

  /// New country partner with their admin account (needs step-up)
  @POST('/admin/country-partners')
  Future<CountryPartnerDetailEnvelope> createCountryPartner({
    @Body() required CreateCountryPartnerDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// The partner contract template (current version)
  @GET('/admin/country-partners/contract')
  Future<CountryPartnerContractEnvelope> getCountryPartnerContract({
    @Extras() Map<String, dynamic>? extras,
  });

  /// Save a new contract version; every partner accepts it again
  @PUT('/admin/country-partners/contract')
  Future<CountryPartnerContractEnvelope> updateCountryPartnerContract({
    @Body() required UpdateCountryPartnerContractDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One partner: team, goals, monthly settlements, month so far
  @GET('/admin/country-partners/{id}')
  Future<CountryPartnerDetailEnvelope> getCountryPartner({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Name, contact, staff limit, dates, goals, note
  @PATCH('/admin/country-partners/{id}')
  Future<CountryPartnerDetailEnvelope> updateCountryPartner({
    @Path('id') required String id,
    @Body() required UpdateCountryPartnerDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Change the share, percent (needs step-up)
  @PUT('/admin/country-partners/{id}/share')
  Future<CountryPartnerDetailEnvelope> setCountryPartnerShare({
    @Path('id') required String id,
    @Body() required SetCountryPartnerShareDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Payouts on (needs step-up) or off (at once)
  @PUT('/admin/country-partners/{id}/payouts')
  Future<CountryPartnerDetailEnvelope> setCountryPartnerPayouts({
    @Path('id') required String id,
    @Body() required SetCountryPartnerPayoutsDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// active / paused / disabled. Disabling signs the whole team out at once; turning back on needs step-up
  @PUT('/admin/country-partners/{id}/status')
  Future<CountryPartnerDetailEnvelope> setCountryPartnerStatus({
    @Path('id') required String id,
    @Body() required SetCountryPartnerStatusDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My partnership: goals, contract, report (lead / accountant)
  @GET('/admin/country-partner')
  Future<CountryPartnerPortalEnvelope> getCountryPartnerPortal({
    @Extras() Map<String, dynamic>? extras,
  });

  /// The partner accepts the current contract
  @POST('/admin/country-partner/accept-contract')
  Future<CountryPartnerPortalEnvelope> acceptCountryPartnerContract({
    @Body() required AcceptCountryPartnerContractDto body,
    @Extras() Map<String, dynamic>? extras,
  });
}
