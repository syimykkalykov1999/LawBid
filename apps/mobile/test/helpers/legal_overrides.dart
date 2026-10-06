import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/legal/application/legal_providers.dart';
import 'package:lawbid/features/legal/domain/legal_models.dart';

/// Owner 2026-10-05 (legal): the case form, bid detail, support and
/// partner screens read `/legal/settings`; widget tests never hit the
/// network (the retry interceptor would leave timers behind), so they get
/// the compiled-in English fallback texts.
List<Override> legalOverrides([LegalSettings? settings]) => [
      legalSettingsProvider.overrideWith(
        (ref) async =>
            settings ?? LegalSettings.fallback(const StaticTranslatorEn()),
      ),
    ];
