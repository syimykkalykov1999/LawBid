import 'package:dio/dio.dart';
import 'package:http/http.dart' as http;

/// Web: the browser owns the connection (HTTP/2, HTTP/3) already.
void applyAdapter(Dio dio, {required bool native}) {}

http.Client? createNativeClient() => null;
