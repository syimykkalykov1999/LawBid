// Host side of integration_test/perf/perf_suite_test.dart: saves the result
// (JSON + Markdown) to the folder in PERF_OUT (default build/perf/latest) and
// prints the summary. tool/perf/run_device_perf.sh sets PERF_OUT.
import 'dart:convert';
import 'dart:io';

import 'package:integration_test/integration_test_driver.dart';

Future<void> main() => integrationDriver(
      responseDataCallback: (data) async {
        if (data == null) return;
        final out = Directory(
          Platform.environment['PERF_OUT'] ?? 'build/perf/latest',
        )..createSync(recursive: true);
        const json = JsonEncoder.withIndent('  ');
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
