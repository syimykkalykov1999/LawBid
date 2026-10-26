// Host side of integration_test/perf/perf_suite_test.dart: saves the result
// (JSON + Markdown) to the folder in PERF_OUT (default build/perf/latest) and
// prints the summary. tool/perf/run_device_perf.sh sets PERF_OUT.
import 'dart:convert';
import 'dart:io';

import 'package:integration_test/integration_test_driver.dart';

Future<void> main() => integrationDriver(
      responseDataCallback: (data) async {
        final out = Directory(
          Platform.environment['PERF_OUT'] ?? 'build/perf/latest',
        )..createSync(recursive: true);
        const json = JsonEncoder.withIndent('  ');
        // Never "no result": when the phone sent nothing, say so in a file.
        if (data == null || data['perf_result'] == null) {
          final md = data?['perf_markdown'];
          final text = md is String
              ? md
              : '# LawBid on-device performance\n\nThe phone sent no result '
                  '(the app died or the test never reached its end). '
                  'See drive.log.\n';
          File('${out.path}/perf_result.md').writeAsStringSync(text);
          File('${out.path}/perf_result.json').writeAsStringSync(
            json.convert(
              {'passed': false, 'error': 'no result from the phone'},
            ),
          );
          stdout.writeln(text);
          return;
        }
        final result = data['perf_result'];
        if (result != null) {
          File('${out.path}/perf_result.json')
              .writeAsStringSync(json.convert(result));
        }
        final md = data['perf_markdown'];
        if (md is String) {
          File('${out.path}/perf_result.md').writeAsStringSync(md);
          stdout.writeln(md);
        }
        // Flutter's own per-scenario summaries, for DevTools-style digging.
        for (final e in data.entries) {
          if (e.key.endsWith('.flutter')) {
            File('${out.path}/${e.key}.json')
                .writeAsStringSync(json.convert(e.value));
          }
        }
        stdout.writeln('perf: written to ${out.path}');
      },
    );
