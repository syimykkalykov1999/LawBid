// Host side of integration_test/scroll_perf_test.dart: saves what the test
// measured to build/ (PERF_LABEL=before|after names the run).
import 'dart:convert';
import 'dart:io';

import 'package:integration_test/integration_test_driver.dart';

Future<void> main() => integrationDriver(
      responseDataCallback: (data) async {
        if (data == null) return;
        final label = Platform.environment['PERF_LABEL'] ?? 'latest';
        Directory('build').createSync(recursive: true);
        const json = JsonEncoder.withIndent('  ');
        File('build/scroll_perf_$label.json')
            .writeAsStringSync(json.convert(data));
        // One file per screen as well (Flutter's summary + the budget view).
        for (final entry in data.entries) {
          File('build/scroll_perf_${label}_${entry.key}.json')
              .writeAsStringSync(json.convert(entry.value));
        }
        stdout.writeln('perf: summaries written to build/scroll_perf_$label*');
      },
    );
