import 'package:web/web.dart' as web;

bool? _webmOpus;

/// R2 review (owner row 146): whether this browser plays Opus in WebM
/// (`HTMLMediaElement.canPlayType`, MDN): "" = no. Safari on older iPhones
/// answers "", so it gets the AAC/M4A copy instead. Asked once per page.
bool canPlayWebmOpus() => _webmOpus ??= () {
      try {
        return (web.document.createElement('audio') as web.HTMLAudioElement)
            .canPlayType('audio/webm; codecs=opus')
            .isNotEmpty;
      } on Object {
        return true;
      }
    }();
