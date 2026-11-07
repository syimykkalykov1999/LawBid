import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/cases/workspace/file_actions.dart';

/// Owner 2026-11-05: a finished case file stays until someone deletes it; only
/// a download abandoned for a week goes.
void main() {
  test('old broken downloads go, finished files stay', () async {
    final dir = Directory.systemTemp.createTempSync('case_files_');
    addTearDown(() => dir.deleteSync(recursive: true));
    final now = DateTime(2026, 10, 22);
    final old = File('${dir.path}/old.pdf')..writeAsStringSync('x');
    final part = File('${dir.path}/broken.pdf.part')..writeAsStringSync('x');
    final freshPart = File('${dir.path}/running.pdf.part')
      ..writeAsStringSync('x');
    old.setLastModifiedSync(now.subtract(const Duration(days: 80)));
    part.setLastModifiedSync(now.subtract(const Duration(days: 9)));
    freshPart.setLastModifiedSync(now.subtract(const Duration(days: 2)));

    await CaseFileCache.cleanUpDir(dir, now: now);

    expect(old.existsSync(), isTrue);
    expect(part.existsSync(), isFalse);
    expect(freshPart.existsSync(), isTrue);
  });
}
