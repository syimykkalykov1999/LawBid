import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/application/case_history_controller.dart';
import 'package:lawbid/features/cases/presentation/widgets/reauth_gate_view.dart';
import 'package:lawbid/features/settings/data_export/application/data_export_providers.dart';
import 'package:lawbid/features/settings/data_export/data/data_export_repository.dart';
import 'package:lawbid/features/settings/data_export/presentation/data_export_screen.dart';

import '../../../helpers/fake_http_adapter.dart';
import '../../../helpers/ux_harness.dart';

/// docs/06 §5.2 «Скачать мои данные»: repository mapping, and the screen
/// behind the reauth gate (request → polling → ready with a link).
class _OpenAccess extends HistoryAccessController {
  @override
  HistoryAccess build() =>
      HistoryAccess(token: 'reauth-1', issuedAt: DateTime.now());
}

class _LockedAccess extends HistoryAccessController {
  @override
  HistoryAccess build() => const HistoryAccess();
}

class _FakeRepo implements DataExportRepository {
  final List<String> calls = [];
  final List<DataExport> statuses = [];
  Object? requestError;

  DataExport _job(DataExportStatus status, {String? url}) => DataExport(
        id: 'exp-1',
        status: status,
        url: url,
        expiresAt: DateTime.utc(2026, 10, 1, 12),
        createdAt: DateTime.utc(2026, 9, 30, 12),
      );

  @override
  Future<DataExport> request(String reauthToken) async {
    calls.add('request:$reauthToken');
    // ignore: only_throw_errors
    if (requestError != null) throw requestError!;
    return _job(DataExportStatus.queued);
  }

  /// Tokens the server refuses (used up / expired): 401 REAUTH_INVALID.
  final Set<String> refused = {};

  @override
  Future<DataExport> status(String exportId, {String? reauthToken}) async {
    calls.add(
      reauthToken == null
          ? 'status:$exportId'
          : 'status:$exportId:$reauthToken',
    );
    if (refused.contains(reauthToken)) {
      throw const ApiException(
        code: ApiErrorCodes.reauthInvalid,
        message: 'x',
        statusCode: 401,
      );
    }
    final next = statuses.isEmpty
        ? _job(DataExportStatus.processing)
        : statuses.removeAt(0);
    // R2B-12: the server gives the link only with a fresh reauth.
    if (next.status == DataExportStatus.ready && reauthToken == null) {
      return _job(DataExportStatus.ready);
    }
    return next;
  }
}

/// A gate whose token ran out (older than the 5-minute window).
class _StaleAccess extends HistoryAccessController {
  @override
  HistoryAccess build() => HistoryAccess(
        token: 'reauth-old',
        issuedAt: DateTime.now().subtract(const Duration(minutes: 6)),
      );
}

DataExport _ready() => DataExport(
      id: 'exp-1',
      status: DataExportStatus.ready,
      url: 'https://s3.test/exports/x.zip',
      expiresAt: DateTime.utc(2026, 10, 1, 12),
      createdAt: DateTime.utc(2026, 9, 30, 12),
    );

void main() {
  setUpAll(initializeDateFormatting);

  group('ApiDataExportRepository', () {
    test('request sends the reauth header; status maps the row', () async {
      final adapter = FakeHttpAdapter(
        (o) async => ok({
          'exportId': '11111111-1111-1111-1111-111111111111',
          'status': 'ready',
          'url': 'https://s3.test/exports/x.zip?sig=1',
          'expiresAt': '2026-10-01T12:00:00.000Z',
          'createdAt': '2026-09-30T12:00:00.000Z',
        }),
      );
      final dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
        ..httpClientAdapter = adapter;
      final repo = ApiDataExportRepository(dio);
      final job = await repo.request('tok');
      expect(adapter.requests.single.path, '/users/me/data-export');
      expect(adapter.requests.single.headers['X-Reauth-Token'], 'tok');
      expect(job.status, DataExportStatus.ready);
      expect(job.url, contains('x.zip'));
      expect(job.expiresAt, DateTime.utc(2026, 10, 1, 12));

      await repo.status(job.id);
      expect(
        adapter.requests.last.path,
        endsWith('/users/me/data-export/${job.id}'),
      );
      // R2B-12: no token → no header; with one → X-Reauth-Token.
      expect(
        adapter.requests.last.headers.containsKey('X-Reauth-Token'),
        isFalse,
      );
      await repo.status(job.id, reauthToken: 'tok-2');
      expect(adapter.requests.last.headers['X-Reauth-Token'], 'tok-2');
    });

    test('an unknown status does not crash', () {
      expect(DataExportStatus.parse('paused'), DataExportStatus.unknown);
      expect(DataExportStatus.parse('queued').inProgress, isTrue);
    });
  });

  group('DataExportScreen', () {
    late _FakeRepo repo;

    final launched = <Uri>[];

    Future<void> pump(
      WidgetTester tester, {
      bool open = true,
      HistoryAccessController Function()? access,
    }) async {
      await tester.pumpWidget(
        uxApp(
          const DataExportScreen(),
          theme: AppTheme.light(),
          disableAnimations: true,
          overrides: uxOverrides(
            extra: [
              dataExportRepositoryProvider.overrideWithValue(repo),
              dataExportPollIntervalProvider
                  .overrideWithValue(const Duration(milliseconds: 10)),
              historyAccessProvider.overrideWith(
                access ?? () => open ? _OpenAccess() : _LockedAccess(),
              ),
              dataExportLauncherProvider.overrideWithValue((uri) async {
                launched.add(uri);
                return true;
              }),
            ],
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
    }

    setUp(() {
      repo = _FakeRepo();
      launched.clear();
    });

    Future<void> requestAndPollToReady(WidgetTester tester) async {
      repo.statuses.add(_ready());
      await tester.tap(find.byKey(const ValueKey('request-export')));
      await tester.pump();
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 20));
      await tester.pump();
    }

    testWidgets(
        'R2B-12: polling carries the fresh gate token; '
        'download reads the link with it', (tester) async {
      await pump(tester);
      await requestAndPollToReady(tester);
      expect(repo.calls, contains('status:exp-1:reauth-1'));
      expect(find.text('Ready'), findsOneWidget);
      repo.statuses.add(_ready());
      await tester.tap(find.byKey(const ValueKey('download-export')));
      await tester.pump();
      await tester.pump();
      // The gate's token is still fresh: no sheet, the link opens.
      expect(find.byKey(const ValueKey('reauth-sheet')), findsNothing);
      expect(repo.calls.last, 'status:exp-1:reauth-1');
      expect(launched, [Uri.parse('https://s3.test/exports/x.zip')]);
    });

    testWidgets(
        'R2B-12: the token ran out → the export stays, '
        '«Download» asks for the reauth sheet first', (tester) async {
      await pump(tester, access: _StaleAccess.new);
      // A job requested earlier this visit: the stale gate does not hide it.
      final container = ProviderScope.containerOf(
        tester.element(find.byType(DataExportScreen)),
      );
      expect(find.byType(ReauthGateView), findsOneWidget);
      container.read(historyAccessProvider.notifier).acceptToken('reauth-1');
      await tester.pump();
      await requestAndPollToReady(tester);
      // The window closes: the status polled without the token has no link.
      container.read(historyAccessProvider.notifier).useCode();
      repo.statuses.add(_ready());
      await container.read(dataExportControllerProvider.notifier).refresh();
      await tester.pump();
      expect(container.read(dataExportControllerProvider).value?.url, isNull);
      expect(find.text('Ready'), findsOneWidget);
      expect(find.byKey(const ValueKey('download-export')), findsOneWidget);

      repo.statuses.add(_ready());
      await tester.tap(find.byKey(const ValueKey('download-export')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('reauth-sheet')), findsOneWidget);
      expect(launched, isEmpty);
      // The person confirms (password / code → a new token): the sheet
      // closes, the link is read with that token and opened.
      container.read(historyAccessProvider.notifier).acceptToken('reauth-2');
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('reauth-sheet')), findsNothing);
      expect(repo.calls.last, 'status:exp-1:reauth-2');
      expect(launched, [Uri.parse('https://s3.test/exports/x.zip')]);
    });

    testWidgets(
        'R2B-12: a token the server refuses at download opens the sheet; '
        'closing it opens nothing', (tester) async {
      await pump(tester);
      await requestAndPollToReady(tester);
      repo.refused.add('reauth-1');
      await tester.tap(find.byKey(const ValueKey('download-export')));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('reauth-sheet')), findsOneWidget);
      Navigator.of(
        tester.element(find.byKey(const ValueKey('reauth-sheet'))),
      ).pop();
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('reauth-sheet')), findsNothing);
      expect(launched, isEmpty);
    });

    testWidgets('locked: the reauth gate, no request button', (tester) async {
      await pump(tester, open: false);
      expect(find.byType(ReauthGateView), findsOneWidget);
      expect(find.byKey(const ValueKey('request-export')), findsNothing);
    });

    testWidgets('open: request → polls → ready with a download button',
        (tester) async {
      repo.statuses.addAll([
        DataExport(
          id: 'exp-1',
          status: DataExportStatus.processing,
          createdAt: DateTime.utc(2026, 9, 30, 12),
        ),
        DataExport(
          id: 'exp-1',
          status: DataExportStatus.ready,
          url: 'https://s3.test/exports/x.zip',
          expiresAt: DateTime.utc(2026, 10, 1, 12),
          createdAt: DateTime.utc(2026, 9, 30, 12),
        ),
      ]);
      await pump(tester);
      expect(find.text('Request export'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('request-export')));
      await tester.pump();
      await tester.pump();
      expect(repo.calls.first, 'request:reauth-1');
      expect(find.text('Queued'), findsOneWidget);
      // Polling: processing, then ready.
      await tester.pump(const Duration(milliseconds: 20));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 20));
      await tester.pump();
      expect(find.text('Ready'), findsOneWidget);
      expect(find.byKey(const ValueKey('download-export')), findsOneWidget);
      expect(find.textContaining('The link works until'), findsOneWidget);
      expect(find.text('Request again'), findsOneWidget);
    });

    testWidgets('a consumed reauth token locks the gate again', (tester) async {
      repo.requestError = const ApiException(
        code: ApiErrorCodes.reauthInvalid,
        message: 'x',
        statusCode: 401,
      );
      await pump(tester);
      await tester.tap(find.byKey(const ValueKey('request-export')));
      await tester.pump();
      await tester.pump();
      expect(find.byType(ReauthGateView), findsOneWidget);
    });

    testWidgets('server error is shown inline, button stays usable',
        (tester) async {
      repo.requestError = const ApiException(
        code: 'PAYLOAD_TOO_LARGE',
        message: 'x',
        statusCode: 413,
      );
      await pump(tester);
      await tester.tap(find.byKey(const ValueKey('request-export')));
      await tester.pump();
      await tester.pump();
      expect(find.byKey(const ValueKey('export-error')), findsOneWidget);
      expect(
        tester
            .widget<AppButton>(find.byKey(const ValueKey('request-export')))
            .isLoading,
        isFalse,
      );
    });
  });
}
