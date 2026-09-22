import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'static_translator.dart';
import 'translator.dart';

/// Stage 1.6 overrides this with the real L10n-backed [Translator]; every
/// call site keeps working unchanged (see translator.dart doc comment).
final translatorProvider = Provider<Translator>((ref) => const StaticTranslator());
