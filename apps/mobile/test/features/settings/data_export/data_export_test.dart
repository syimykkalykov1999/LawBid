import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
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

  @override
  Future<DataExport> status(String exportId) async {
    calls.add('status:$exportId');
    return statuses.isEmpty
        ? _job(DataExportStatus.processing)
        : statuses.removeAt(0);
  }
}

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
    });

    test('an unknown status does not crash', () {
      expect(DataExportStatus.parse('paused'), DataExportStatus.unknown);
      expect(DataExportStatus.parse('queued').inProgress, isTrue);
    });
  });

  group('DataExportScreen', () {
    late _FakeRepo repo;

    Future<void> pump(WidgetTester tester, {bool open = true}) async {
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
                () => open ? _OpenAccess() : _LockedAccess(),
              ),
            ],
          ),
        ),
      );
      await tester.pump();
      await tester.pump();
    }

    setUp(() => repo = _FakeRepo());

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
