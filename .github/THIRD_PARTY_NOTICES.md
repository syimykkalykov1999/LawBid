# Third-party code used by the CI workflows

## anthropics/claude-code-action (used by `.github/workflows/ai-assistant.yml`)
- Source: https://github.com/anthropics/claude-code-action, pinned to v1.0.269
  (commit 61a9c274fa7110a66dfafc1bbbced03833eb25fe, 2026-11-06).
- License: MIT (GitHub license detection `MIT`, checked 09.11.2026).
- Used as is, by reference from the workflow. No code of it is copied into this repository.

MIT License

Copyright (c) 2025 Anthropic, PBC

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES
OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## fonttools (used by `.github/workflows/web-deploy.yml` through `apps/mobile/tool/slim_fonts.py`)
- Source: https://github.com/fonttools/fonttools, PyPI `fonttools==4.68.0` (2026-10-27).
- License: MIT (checked 14.11.2026, file LICENSE of the 4.68.0 wheel).
- Installed in the deploy job only and used as is; no code of it is copied into this repository.

MIT License

Copyright (c) 2017 Just van Rossum

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## uharfbuzz (used by `.github/workflows/web-deploy.yml` through `apps/mobile/tool/slim_fonts.py`)
- Source: https://github.com/harfbuzz/uharfbuzz, PyPI `uharfbuzz==0.57.0` (2026-10-23); it bundles HarfBuzz (https://github.com/harfbuzz/harfbuzz, "Old MIT" license).
- License: Apache License 2.0 (checked 15.11.2026, METADATA and LICENSE of the 0.57.0 wheel). Full text: https://www.apache.org/licenses/LICENSE-2.0
- Installed in the deploy job only and used as is to check that the web font copies shape exactly like the upstream files; no code of it is copied into this repository and nothing of it is shipped.

## Brotli (Python binding; used by `.github/workflows/web-deploy.yml` through `apps/mobile/tool/slim_fonts.py`)
- Source: https://github.com/google/brotli, PyPI `brotli==1.2.1` (2026-10-22).
- License: MIT (checked 17.11.2026, METADATA and LICENSE of the 1.2.1 wheel).
- Installed in the deploy job only; fontTools calls it to write the WOFF2 web copies of the text fonts. No code of it is copied into this repository.

Copyright (c) 2009, 2010, 2013-2016 by the Brotli Authors.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
