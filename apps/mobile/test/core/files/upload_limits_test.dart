import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/files/upload_limits.dart';

/// Owner 2026-10-07 (bug 17): the admin's upload limits in the app.
void main() {
  test('no value keeps the defaults', () {
    final l = UploadLimits.parse(null);
    expect(l[UploadPlace.post].maxPhotos, 9);
    expect(l[UploadPlace.kase].maxFiles, 9);
    expect(l[UploadPlace.task].maxFiles, 10);
    expect(l[UploadPlace.avatar].fileMb, 5);
    expect(l[UploadPlace.chat].fileBytes, 25 * 1024 * 1024);
  });

  test('admin values and formats apply; unknown formats are dropped', () {
    final l = UploadLimits.parse(
      '{"post":{"maxPhotos":4,"maxFiles":2,"fileMb":5,'
      '"formats":["jpeg","pdf","xlsx","apk"]},"case":"broken"}',
    );
    final post = l[UploadPlace.post];
    expect(post.maxPhotos, 4);
    expect(post.maxFiles, 2);
    expect(post.fileMb, 5);
    expect(post.formats, {'jpeg', 'pdf', 'xlsx'});
    expect(post.documentExtensions, containsAll(['pdf', 'xlsx']));
    expect(post.documentExtensions, isNot(contains('jpg')));
    expect(post.mimeForName('Table.XLSX'), startsWith('application/vnd.'));
    expect(post.mimeForName('setup.apk'), isNull);
    expect(l[UploadPlace.kase].maxFiles, 9);
  });

  test('broken JSON keeps the defaults', () {
    expect(UploadLimits.parse('{not json')[UploadPlace.review].maxPhotos, 10);
  });
}
