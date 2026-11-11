import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// [CaseFilesRemote] over a fixed list: the tab's kind and filter are
/// applied the way the server applies them, all files on one page.
class FakeCaseFilesRemote implements CaseFilesRemote {
  FakeCaseFilesRemote(this.files, {this.onPage});

  final List<api.WorkspaceFileDto> files;

  /// Replaces the answer (an error, a pending future) when set.
  final Future<CursorPage<api.WorkspaceFileDto>> Function()? onPage;

  static bool _media(api.WorkspaceFileDto f) =>
      f.mime.startsWith('image/') || f.mime.startsWith('video/');

  @override
  Future<CursorPage<api.WorkspaceFileDto>> page(
    CaseFilesView view,
    String? cursor,
    int limit,
  ) {
    if (onPage != null) return onPage!();
    final items = files
        .where((f) => _media(f) == view.media)
        .where(
          (f) => switch (view.filter) {
            1 => f.source == api.WorkspaceFileDtoSource.task,
            2 => f.source == api.WorkspaceFileDtoSource.update,
            3 => f.sample,
            _ => true,
          },
        )
        .toList();
    return Future.value(CursorPage(items: items));
  }

  @override
  Future<bool> hasSamples(String caseId, {required bool media}) =>
      Future.value(files.any((f) => f.sample && _media(f) == media));
}
