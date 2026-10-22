import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/cases/workspace/file_actions.dart';

/// Owner 2026-10-22 (load audit finding 8): case files not used for a week
/// leave the phone; recent ones stay.
void main() {
  test('files older than 7 days are deleted, recent ones kept', () async {
    final dir = Directory.systemTemp.createTempSync('case_files_');
    addTearDown(() => dir.deleteSync(recursive: true));
    final now = DateTime(2026, 10, 22);
    final old = File('${dir.path}/old.pdf')..writeAsStringSync('x');
    final part = File('${dir.path}/broken.pdf.part')..writeAsStringSync('x');
    final fresh = File('${dir.path}/fresh.pdf')..writeAsStringSync('x');
    old.setLastModifiedSync(now.subtract(const Duration(days: 8)));
    part.setLastModifiedSync(now.subtract(const Duration(days: 9)));
    fresh.setLastModifiedSync(now.subtract(const Duration(days: 2)));

    await CaseFileCache.cleanUpDir(dir, now: now);

    expect(old.existsSync(), isFalse);
    expect(part.existsSync(), isFalse);
    expect(fresh.existsSync(), isTrue);
  });
}
