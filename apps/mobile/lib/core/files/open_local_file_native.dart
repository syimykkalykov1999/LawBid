import 'package:lawbid/core/files/open_local_file.dart';
import 'package:open_filex/open_filex.dart';

Future<OpenLocalResult> openFile(String path, String mime) async {
  final result = await OpenFilex.open(path, type: mime);
  return switch (result.type) {
    ResultType.done => OpenLocalResult.opened,
    ResultType.fileNotFound => OpenLocalResult.fileGone,
    ResultType.noAppToOpen => OpenLocalResult.noApp,
    ResultType.permissionDenied || ResultType.error => OpenLocalResult.failed,
  };
}
