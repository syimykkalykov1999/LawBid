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
import 'clients/admin_users_client.dart';
import 'clients/verification_client.dart';
import 'clients/admin_verification_client.dart';
import 'clients/files_client.dart';
import 'clients/admin_cases_client.dart';
import 'clients/admin_data_requests_client.dart';
import 'clients/admin_config_client.dart';
import 'clients/subscriptions_client.dart';
import 'clients/admin_subscriptions_client.dart';
import 'clients/bids_client.dart';
import 'clients/users_client.dart';
import 'clients/i18n_client.dart';
import 'clients/admin_i18n_client.dart';
import 'clients/cases_client.dart';
import 'clients/mine_client.dart';
import 'clients/admin_contact_issues_client.dart';
import 'clients/admin_case_disputes_client.dart';
import 'clients/posts_client.dart';
import 'clients/case_history_client.dart';
import 'clients/admin_moderation_client.dart';
import 'clients/feed_client.dart';
import 'clients/comments_client.dart';
import 'clients/reports_client.dart';
import 'clients/follows_client.dart';
import 'clients/search_client.dart';
import 'clients/chat_client.dart';
import 'clients/notifications_client.dart';
import 'clients/practice_areas_client.dart';
import 'clients/attorneys_client.dart';
import 'clients/profiles_client.dart';
import 'clients/reviews_client.dart';

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
  AdminUsersClient? _adminUsers;
  VerificationClient? _verification;
  AdminVerificationClient? _adminVerification;
  FilesClient? _files;
  AdminCasesClient? _adminCases;
  AdminDataRequestsClient? _adminDataRequests;
  AdminConfigClient? _adminConfig;
  SubscriptionsClient? _subscriptions;
  AdminSubscriptionsClient? _adminSubscriptions;
  BidsClient? _bids;
  UsersClient? _users;
  I18nClient? _i18n;
  AdminI18nClient? _adminI18n;
  CasesClient? _cases;
  MineClient? _mine;
  AdminContactIssuesClient? _adminContactIssues;
  AdminCaseDisputesClient? _adminCaseDisputes;
  PostsClient? _posts;
  CaseHistoryClient? _caseHistory;
  AdminModerationClient? _adminModeration;
  FeedClient? _feed;
  CommentsClient? _comments;
  ReportsClient? _reports;
  FollowsClient? _follows;
  SearchClient? _search;
  ChatClient? _chat;
  NotificationsClient? _notifications;
  PracticeAreasClient? _practiceAreas;
  AttorneysClient? _attorneys;
  ProfilesClient? _profiles;
  ReviewsClient? _reviews;

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

  AdminUsersClient get adminUsers =>
      _adminUsers ??= AdminUsersClient(_dio, baseUrl: _baseUrl);

  VerificationClient get verification =>
      _verification ??= VerificationClient(_dio, baseUrl: _baseUrl);

  AdminVerificationClient get adminVerification =>
      _adminVerification ??= AdminVerificationClient(_dio, baseUrl: _baseUrl);

  FilesClient get files => _files ??= FilesClient(_dio, baseUrl: _baseUrl);

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

  BidsClient get bids => _bids ??= BidsClient(_dio, baseUrl: _baseUrl);

  UsersClient get users => _users ??= UsersClient(_dio, baseUrl: _baseUrl);

  I18nClient get i18n => _i18n ??= I18nClient(_dio, baseUrl: _baseUrl);

  AdminI18nClient get adminI18n =>
      _adminI18n ??= AdminI18nClient(_dio, baseUrl: _baseUrl);

  CasesClient get cases => _cases ??= CasesClient(_dio, baseUrl: _baseUrl);

  MineClient get mine => _mine ??= MineClient(_dio, baseUrl: _baseUrl);

  AdminContactIssuesClient get adminContactIssues =>
      _adminContactIssues ??= AdminContactIssuesClient(_dio, baseUrl: _baseUrl);

  AdminCaseDisputesClient get adminCaseDisputes =>
      _adminCaseDisputes ??= AdminCaseDisputesClient(_dio, baseUrl: _baseUrl);

  PostsClient get posts => _posts ??= PostsClient(_dio, baseUrl: _baseUrl);

  CaseHistoryClient get caseHistory =>
      _caseHistory ??= CaseHistoryClient(_dio, baseUrl: _baseUrl);

  AdminModerationClient get adminModeration =>
      _adminModeration ??= AdminModerationClient(_dio, baseUrl: _baseUrl);

  FeedClient get feed => _feed ??= FeedClient(_dio, baseUrl: _baseUrl);

  CommentsClient get comments =>
      _comments ??= CommentsClient(_dio, baseUrl: _baseUrl);

  ReportsClient get reports =>
      _reports ??= ReportsClient(_dio, baseUrl: _baseUrl);

  FollowsClient get follows =>
      _follows ??= FollowsClient(_dio, baseUrl: _baseUrl);

  SearchClient get search => _search ??= SearchClient(_dio, baseUrl: _baseUrl);

  ChatClient get chat => _chat ??= ChatClient(_dio, baseUrl: _baseUrl);

  NotificationsClient get notifications =>
      _notifications ??= NotificationsClient(_dio, baseUrl: _baseUrl);

  PracticeAreasClient get practiceAreas =>
      _practiceAreas ??= PracticeAreasClient(_dio, baseUrl: _baseUrl);

  AttorneysClient get attorneys =>
      _attorneys ??= AttorneysClient(_dio, baseUrl: _baseUrl);

  ProfilesClient get profiles =>
      _profiles ??= ProfilesClient(_dio, baseUrl: _baseUrl);

  ReviewsClient get reviews =>
      _reviews ??= ReviewsClient(_dio, baseUrl: _baseUrl);
}
