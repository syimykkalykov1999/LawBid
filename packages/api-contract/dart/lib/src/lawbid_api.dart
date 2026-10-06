// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';

import 'clients/config_client.dart';
import 'clients/auth_client.dart';
import 'clients/admin_auth_client.dart';
import 'clients/admin_dashboard_client.dart';
import 'clients/admin_audit_log_client.dart';
import 'clients/admin_admins_client.dart';
import 'clients/admin_sessions_client.dart';
import 'clients/admin_users_client.dart';
import 'clients/verification_client.dart';
import 'clients/admin_verification_client.dart';
import 'clients/files_client.dart';
import 'clients/bids_client.dart';
import 'clients/admin_sanctions_client.dart';
import 'clients/admin_cases_client.dart';
import 'clients/admin_data_requests_client.dart';
import 'clients/admin_config_client.dart';
import 'clients/subscriptions_client.dart';
import 'clients/admin_subscriptions_client.dart';
import 'clients/plans_client.dart';
import 'clients/assistants_client.dart';
import 'clients/admin_teams_client.dart';
import 'clients/posts_client.dart';
import 'clients/videos_client.dart';
import 'clients/comments_client.dart';
import 'clients/case_comments_client.dart';
import 'clients/cases_client.dart';
import 'clients/mine_client.dart';
import 'clients/invites_client.dart';
import 'clients/admin_contact_issues_client.dart';
import 'clients/admin_case_disputes_client.dart';
import 'clients/users_client.dart';
import 'clients/practice_areas_client.dart';
import 'clients/attorneys_client.dart';
import 'clients/profiles_client.dart';
import 'clients/clients_client.dart';
import 'clients/blocks_client.dart';
import 'clients/admin_content_client.dart';
import 'clients/admin_media_client.dart';
import 'clients/document_templates_client.dart';
import 'clients/admin_document_templates_client.dart';
import 'clients/admin_billing_client.dart';
import 'clients/billing_client.dart';
import 'clients/admin_payroll_client.dart';
import 'clients/support_client.dart';
import 'clients/admin_support_client.dart';
import 'clients/admin_storage_client.dart';
import 'clients/admin_treasury_client.dart';
import 'clients/admin_rewards_client.dart';
import 'clients/admin_workspace_client.dart';
import 'clients/admin_email_templates_client.dart';
import 'clients/i18n_client.dart';
import 'clients/admin_i18n_client.dart';
import 'clients/case_history_client.dart';
import 'clients/admin_moderation_client.dart';
import 'clients/stickers_client.dart';
import 'clients/feed_client.dart';
import 'clients/client_reviews_client.dart';
import 'clients/admin_review_appeals_client.dart';
import 'clients/reports_client.dart';
import 'clients/follows_client.dart';
import 'clients/search_client.dart';
import 'clients/presence_client.dart';
import 'clients/admin_integrations_client.dart';
import 'clients/admin_ops_client.dart';
import 'clients/referrals_client.dart';
import 'clients/admin_referrals_client.dart';
import 'clients/partners_client.dart';
import 'clients/admin_partners_client.dart';
import 'clients/legal_client.dart';
import 'clients/admin_legal_client.dart';
import 'clients/demo_client.dart';
import 'clients/admin_demo_client.dart';
import 'clients/admin_outreach_client.dart';
import 'clients/promotions_client.dart';
import 'clients/admin_promotions_client.dart';
import 'clients/case_payments_client.dart';
import 'clients/admin_case_payments_client.dart';
import 'clients/client_badge_client.dart';
import 'clients/admin_client_badge_client.dart';
import 'clients/chat_client.dart';
import 'clients/translations_client.dart';
import 'clients/calls_client.dart';
import 'clients/notifications_client.dart';
import 'clients/trust_client.dart';
import 'clients/admin_trust_client.dart';
import 'clients/countries_client.dart';
import 'clients/admin_countries_client.dart';
import 'clients/reviews_client.dart';
import 'clients/admin_fraud_client.dart';
import 'clients/admin_country_partners_client.dart';

/// LawBid API `v0.1.0`.
///
/// LawBid — US legal-services marketplace. Every 2xx JSON body is the envelope {data, meta?: {nextCursor}} and every error is {error: {code, message, details?, requestId}} with `code` from the ErrorCode enum — docs/01_FOUNDATION_AUTH.md §7.
class LawbidApi {
  LawbidApi(Dio dio, {String? baseUrl}) : _dio = dio, _baseUrl = baseUrl;

  final Dio _dio;
  final String? _baseUrl;

  static String get version => '0.1.0';

  ConfigClient? _config;
  AuthClient? _auth;
  AdminAuthClient? _adminAuth;
  AdminDashboardClient? _adminDashboard;
  AdminAuditLogClient? _adminAuditLog;
  AdminAdminsClient? _adminAdmins;
  AdminSessionsClient? _adminSessions;
  AdminUsersClient? _adminUsers;
  VerificationClient? _verification;
  AdminVerificationClient? _adminVerification;
  FilesClient? _files;
  BidsClient? _bids;
  AdminSanctionsClient? _adminSanctions;
  AdminCasesClient? _adminCases;
  AdminDataRequestsClient? _adminDataRequests;
  AdminConfigClient? _adminConfig;
  SubscriptionsClient? _subscriptions;
  AdminSubscriptionsClient? _adminSubscriptions;
  PlansClient? _plans;
  AssistantsClient? _assistants;
  AdminTeamsClient? _adminTeams;
  PostsClient? _posts;
  VideosClient? _videos;
  CommentsClient? _comments;
  CaseCommentsClient? _caseComments;
  CasesClient? _cases;
  MineClient? _mine;
  InvitesClient? _invites;
  AdminContactIssuesClient? _adminContactIssues;
  AdminCaseDisputesClient? _adminCaseDisputes;
  UsersClient? _users;
  PracticeAreasClient? _practiceAreas;
  AttorneysClient? _attorneys;
  ProfilesClient? _profiles;
  ClientsClient? _clients;
  BlocksClient? _blocks;
  AdminContentClient? _adminContent;
  AdminMediaClient? _adminMedia;
  DocumentTemplatesClient? _documentTemplates;
  AdminDocumentTemplatesClient? _adminDocumentTemplates;
  AdminBillingClient? _adminBilling;
  BillingClient? _billing;
  AdminPayrollClient? _adminPayroll;
  SupportClient? _support;
  AdminSupportClient? _adminSupport;
  AdminStorageClient? _adminStorage;
  AdminTreasuryClient? _adminTreasury;
  AdminRewardsClient? _adminRewards;
  AdminWorkspaceClient? _adminWorkspace;
  AdminEmailTemplatesClient? _adminEmailTemplates;
  I18nClient? _i18n;
  AdminI18nClient? _adminI18n;
  CaseHistoryClient? _caseHistory;
  AdminModerationClient? _adminModeration;
  StickersClient? _stickers;
  FeedClient? _feed;
  ClientReviewsClient? _clientReviews;
  AdminReviewAppealsClient? _adminReviewAppeals;
  ReportsClient? _reports;
  FollowsClient? _follows;
  SearchClient? _search;
  PresenceClient? _presence;
  AdminIntegrationsClient? _adminIntegrations;
  AdminOpsClient? _adminOps;
  ReferralsClient? _referrals;
  AdminReferralsClient? _adminReferrals;
  PartnersClient? _partners;
  AdminPartnersClient? _adminPartners;
  LegalClient? _legal;
  AdminLegalClient? _adminLegal;
  DemoClient? _demo;
  AdminDemoClient? _adminDemo;
  AdminOutreachClient? _adminOutreach;
  PromotionsClient? _promotions;
  AdminPromotionsClient? _adminPromotions;
  CasePaymentsClient? _casePayments;
  AdminCasePaymentsClient? _adminCasePayments;
  ClientBadgeClient? _clientBadge;
  AdminClientBadgeClient? _adminClientBadge;
  ChatClient? _chat;
  TranslationsClient? _translations;
  CallsClient? _calls;
  NotificationsClient? _notifications;
  TrustClient? _trust;
  AdminTrustClient? _adminTrust;
  CountriesClient? _countries;
  AdminCountriesClient? _adminCountries;
  ReviewsClient? _reviews;
  AdminFraudClient? _adminFraud;
  AdminCountryPartnersClient? _adminCountryPartners;

  ConfigClient get config => _config ??= ConfigClient(_dio, baseUrl: _baseUrl);

  AuthClient get auth => _auth ??= AuthClient(_dio, baseUrl: _baseUrl);

  AdminAuthClient get adminAuth =>
      _adminAuth ??= AdminAuthClient(_dio, baseUrl: _baseUrl);

  AdminDashboardClient get adminDashboard =>
      _adminDashboard ??= AdminDashboardClient(_dio, baseUrl: _baseUrl);

  AdminAuditLogClient get adminAuditLog =>
      _adminAuditLog ??= AdminAuditLogClient(_dio, baseUrl: _baseUrl);

  AdminAdminsClient get adminAdmins =>
      _adminAdmins ??= AdminAdminsClient(_dio, baseUrl: _baseUrl);

  AdminSessionsClient get adminSessions =>
      _adminSessions ??= AdminSessionsClient(_dio, baseUrl: _baseUrl);

  AdminUsersClient get adminUsers =>
      _adminUsers ??= AdminUsersClient(_dio, baseUrl: _baseUrl);

  VerificationClient get verification =>
      _verification ??= VerificationClient(_dio, baseUrl: _baseUrl);

  AdminVerificationClient get adminVerification =>
      _adminVerification ??= AdminVerificationClient(_dio, baseUrl: _baseUrl);

  FilesClient get files => _files ??= FilesClient(_dio, baseUrl: _baseUrl);

  BidsClient get bids => _bids ??= BidsClient(_dio, baseUrl: _baseUrl);

  AdminSanctionsClient get adminSanctions =>
      _adminSanctions ??= AdminSanctionsClient(_dio, baseUrl: _baseUrl);

  AdminCasesClient get adminCases =>
      _adminCases ??= AdminCasesClient(_dio, baseUrl: _baseUrl);

  AdminDataRequestsClient get adminDataRequests =>
      _adminDataRequests ??= AdminDataRequestsClient(_dio, baseUrl: _baseUrl);

  AdminConfigClient get adminConfig =>
      _adminConfig ??= AdminConfigClient(_dio, baseUrl: _baseUrl);

  SubscriptionsClient get subscriptions =>
      _subscriptions ??= SubscriptionsClient(_dio, baseUrl: _baseUrl);

  AdminSubscriptionsClient get adminSubscriptions =>
      _adminSubscriptions ??= AdminSubscriptionsClient(_dio, baseUrl: _baseUrl);

  PlansClient get plans => _plans ??= PlansClient(_dio, baseUrl: _baseUrl);

  AssistantsClient get assistants =>
      _assistants ??= AssistantsClient(_dio, baseUrl: _baseUrl);

  AdminTeamsClient get adminTeams =>
      _adminTeams ??= AdminTeamsClient(_dio, baseUrl: _baseUrl);

  PostsClient get posts => _posts ??= PostsClient(_dio, baseUrl: _baseUrl);

  VideosClient get videos => _videos ??= VideosClient(_dio, baseUrl: _baseUrl);

  CommentsClient get comments =>
      _comments ??= CommentsClient(_dio, baseUrl: _baseUrl);

  CaseCommentsClient get caseComments =>
      _caseComments ??= CaseCommentsClient(_dio, baseUrl: _baseUrl);

  CasesClient get cases => _cases ??= CasesClient(_dio, baseUrl: _baseUrl);

  MineClient get mine => _mine ??= MineClient(_dio, baseUrl: _baseUrl);

  InvitesClient get invites =>
      _invites ??= InvitesClient(_dio, baseUrl: _baseUrl);

  AdminContactIssuesClient get adminContactIssues =>
      _adminContactIssues ??= AdminContactIssuesClient(_dio, baseUrl: _baseUrl);

  AdminCaseDisputesClient get adminCaseDisputes =>
      _adminCaseDisputes ??= AdminCaseDisputesClient(_dio, baseUrl: _baseUrl);

  UsersClient get users => _users ??= UsersClient(_dio, baseUrl: _baseUrl);

  PracticeAreasClient get practiceAreas =>
      _practiceAreas ??= PracticeAreasClient(_dio, baseUrl: _baseUrl);

  AttorneysClient get attorneys =>
      _attorneys ??= AttorneysClient(_dio, baseUrl: _baseUrl);

  ProfilesClient get profiles =>
      _profiles ??= ProfilesClient(_dio, baseUrl: _baseUrl);

  ClientsClient get clients =>
      _clients ??= ClientsClient(_dio, baseUrl: _baseUrl);

  BlocksClient get blocks => _blocks ??= BlocksClient(_dio, baseUrl: _baseUrl);

  AdminContentClient get adminContent =>
      _adminContent ??= AdminContentClient(_dio, baseUrl: _baseUrl);

  AdminMediaClient get adminMedia =>
      _adminMedia ??= AdminMediaClient(_dio, baseUrl: _baseUrl);

  DocumentTemplatesClient get documentTemplates =>
      _documentTemplates ??= DocumentTemplatesClient(_dio, baseUrl: _baseUrl);

  AdminDocumentTemplatesClient get adminDocumentTemplates =>
      _adminDocumentTemplates ??= AdminDocumentTemplatesClient(
        _dio,
        baseUrl: _baseUrl,
      );

  AdminBillingClient get adminBilling =>
      _adminBilling ??= AdminBillingClient(_dio, baseUrl: _baseUrl);

  BillingClient get billing =>
      _billing ??= BillingClient(_dio, baseUrl: _baseUrl);

  AdminPayrollClient get adminPayroll =>
      _adminPayroll ??= AdminPayrollClient(_dio, baseUrl: _baseUrl);

  SupportClient get support =>
      _support ??= SupportClient(_dio, baseUrl: _baseUrl);

  AdminSupportClient get adminSupport =>
      _adminSupport ??= AdminSupportClient(_dio, baseUrl: _baseUrl);

  AdminStorageClient get adminStorage =>
      _adminStorage ??= AdminStorageClient(_dio, baseUrl: _baseUrl);

  AdminTreasuryClient get adminTreasury =>
      _adminTreasury ??= AdminTreasuryClient(_dio, baseUrl: _baseUrl);

  AdminRewardsClient get adminRewards =>
      _adminRewards ??= AdminRewardsClient(_dio, baseUrl: _baseUrl);

  AdminWorkspaceClient get adminWorkspace =>
      _adminWorkspace ??= AdminWorkspaceClient(_dio, baseUrl: _baseUrl);

  AdminEmailTemplatesClient get adminEmailTemplates => _adminEmailTemplates ??=
      AdminEmailTemplatesClient(_dio, baseUrl: _baseUrl);

  I18nClient get i18n => _i18n ??= I18nClient(_dio, baseUrl: _baseUrl);

  AdminI18nClient get adminI18n =>
      _adminI18n ??= AdminI18nClient(_dio, baseUrl: _baseUrl);

  CaseHistoryClient get caseHistory =>
      _caseHistory ??= CaseHistoryClient(_dio, baseUrl: _baseUrl);

  AdminModerationClient get adminModeration =>
      _adminModeration ??= AdminModerationClient(_dio, baseUrl: _baseUrl);

  StickersClient get stickers =>
      _stickers ??= StickersClient(_dio, baseUrl: _baseUrl);

  FeedClient get feed => _feed ??= FeedClient(_dio, baseUrl: _baseUrl);

  ClientReviewsClient get clientReviews =>
      _clientReviews ??= ClientReviewsClient(_dio, baseUrl: _baseUrl);

  AdminReviewAppealsClient get adminReviewAppeals =>
      _adminReviewAppeals ??= AdminReviewAppealsClient(_dio, baseUrl: _baseUrl);

  ReportsClient get reports =>
      _reports ??= ReportsClient(_dio, baseUrl: _baseUrl);

  FollowsClient get follows =>
      _follows ??= FollowsClient(_dio, baseUrl: _baseUrl);

  SearchClient get search => _search ??= SearchClient(_dio, baseUrl: _baseUrl);

  PresenceClient get presence =>
      _presence ??= PresenceClient(_dio, baseUrl: _baseUrl);

  AdminIntegrationsClient get adminIntegrations =>
      _adminIntegrations ??= AdminIntegrationsClient(_dio, baseUrl: _baseUrl);

  AdminOpsClient get adminOps =>
      _adminOps ??= AdminOpsClient(_dio, baseUrl: _baseUrl);

  ReferralsClient get referrals =>
      _referrals ??= ReferralsClient(_dio, baseUrl: _baseUrl);

  AdminReferralsClient get adminReferrals =>
      _adminReferrals ??= AdminReferralsClient(_dio, baseUrl: _baseUrl);

  PartnersClient get partners =>
      _partners ??= PartnersClient(_dio, baseUrl: _baseUrl);

  AdminPartnersClient get adminPartners =>
      _adminPartners ??= AdminPartnersClient(_dio, baseUrl: _baseUrl);

  LegalClient get legal => _legal ??= LegalClient(_dio, baseUrl: _baseUrl);

  AdminLegalClient get adminLegal =>
      _adminLegal ??= AdminLegalClient(_dio, baseUrl: _baseUrl);

  DemoClient get demo => _demo ??= DemoClient(_dio, baseUrl: _baseUrl);

  AdminDemoClient get adminDemo =>
      _adminDemo ??= AdminDemoClient(_dio, baseUrl: _baseUrl);

  AdminOutreachClient get adminOutreach =>
      _adminOutreach ??= AdminOutreachClient(_dio, baseUrl: _baseUrl);

  PromotionsClient get promotions =>
      _promotions ??= PromotionsClient(_dio, baseUrl: _baseUrl);

  AdminPromotionsClient get adminPromotions =>
      _adminPromotions ??= AdminPromotionsClient(_dio, baseUrl: _baseUrl);

  CasePaymentsClient get casePayments =>
      _casePayments ??= CasePaymentsClient(_dio, baseUrl: _baseUrl);

  AdminCasePaymentsClient get adminCasePayments =>
      _adminCasePayments ??= AdminCasePaymentsClient(_dio, baseUrl: _baseUrl);

  ClientBadgeClient get clientBadge =>
      _clientBadge ??= ClientBadgeClient(_dio, baseUrl: _baseUrl);

  AdminClientBadgeClient get adminClientBadge =>
      _adminClientBadge ??= AdminClientBadgeClient(_dio, baseUrl: _baseUrl);

  ChatClient get chat => _chat ??= ChatClient(_dio, baseUrl: _baseUrl);

  TranslationsClient get translations =>
      _translations ??= TranslationsClient(_dio, baseUrl: _baseUrl);

  CallsClient get calls => _calls ??= CallsClient(_dio, baseUrl: _baseUrl);

  NotificationsClient get notifications =>
      _notifications ??= NotificationsClient(_dio, baseUrl: _baseUrl);

  TrustClient get trust => _trust ??= TrustClient(_dio, baseUrl: _baseUrl);

  AdminTrustClient get adminTrust =>
      _adminTrust ??= AdminTrustClient(_dio, baseUrl: _baseUrl);

  CountriesClient get countries =>
      _countries ??= CountriesClient(_dio, baseUrl: _baseUrl);

  AdminCountriesClient get adminCountries =>
      _adminCountries ??= AdminCountriesClient(_dio, baseUrl: _baseUrl);

  ReviewsClient get reviews =>
      _reviews ??= ReviewsClient(_dio, baseUrl: _baseUrl);

  AdminFraudClient get adminFraud =>
      _adminFraud ??= AdminFraudClient(_dio, baseUrl: _baseUrl);

  AdminCountryPartnersClient get adminCountryPartners =>
      _adminCountryPartners ??= AdminCountryPartnersClient(
        _dio,
        baseUrl: _baseUrl,
      );
}
