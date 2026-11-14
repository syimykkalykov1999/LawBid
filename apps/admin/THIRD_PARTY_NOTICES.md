# Third-party notices (apps/admin)

Packages taken whole (RULE #1), pinned in `package.json` / `package-lock.json`.
The MIT licence asks only that the copyright and permission notice travel with
the code; here they are.

## browser-image-compression 2.0.2 — MIT

Shrinks sticker / gift pictures in the browser before upload
(`src/lib/image-compress.ts`). https://github.com/Donaldcwl/browser-image-compression

MIT License — Copyright (c) 2019 Donald Chan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions: The above copyright
notice and this permission notice shall be included in all copies or
substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR
THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### uzip 0.20201231.0 — MIT (dependency of browser-image-compression)

MIT License — Copyright (c) 2018 Photopea. Same permission notice as above.

## @tanstack/react-virtual 3.14.25, @tanstack/virtual-core 3.19.10 — MIT

Window-scroll virtualisation of long admin journals (`src/components/ui/virtual-rows.tsx`).
https://github.com/TanStack/virtual

MIT License — Copyright (c) 2021-present Tanner Linsley. Same permission
notice as above.

## Calmer motion (owner row 88, 2026-11-13): code and numbers copied, no package added

- **next-themes** — `disableAnimation` (the code behind `disableTransitionOnChange`),
  copied into `src/lib/theme.tsx`. https://github.com/pacocoursey/next-themes
  MIT License — Copyright (c) 2022 Paco Coursey.
- **sonner** — swipe-to-dismiss threshold (45 px) and velocity (0.11 px/ms) and
  the 16 px phone offset, in `src/components/ui/toast.tsx`. https://github.com/emilkowalski/sonner
  MIT License — Copyright (c) 2023 Emil Kowalski.
- **shadcn/ui** — sidebar collapse on one CSS clock (`transition-[width]
  duration-200 ease-linear`), in `src/components/shell/app-shell.tsx`; Skeleton
  = opacity pulse. https://github.com/shadcn-ui/ui
  MIT License — Copyright (c) 2023 shadcn.
- **Tailwind CSS** — the `animate-pulse` keyframes and timing (2 s,
  cubic-bezier(0.4, 0, 0.6, 1), opacity 0.5), as `skeleton-pulse` in
  `src/app/globals.css`. https://github.com/tailwindlabs/tailwindcss
  MIT License — Copyright (c) Tailwind Labs, Inc.

Same permission notice as above.

## Remaining motion items (owner row 88, 2026-11-13): code copied, no package added

- **Radix UI Primitives** — `FocusScope` copied whole into
  `src/lib/vendor/focus-scope.tsx` (changes marked «LawBid:»); the
  «only the highest layer handles Escape» rule and the IME check of
  `DismissableLayer` / `useEscapeKeydown`, in `src/lib/layers.ts`.
  https://github.com/radix-ui/primitives
  MIT License — Copyright (c) 2022 WorkOS.
- **react-remove-scroll-bar** — `getGapWidth` copied as is and the
  `body[data-scroll-locked]` padding rule, in `src/lib/scroll-lock.ts`.
  https://github.com/theKashey/react-remove-scroll-bar
  MIT License — Copyright (c) 2025 Anton Korzunov.
- **vaul** — the drag logic (`onPress` / `shouldDrag` / `onDrag` /
  `onRelease`), `dampenValue`, the thresholds (velocity 0.4 px/ms, close at
  25 %, 100 ms scroll lock, 500 ms after opening) and the 0.5 s
  `[0.32, 0.72, 0, 1]` curve, in `src/lib/drag-dismiss.ts` (the package says
  it is unmaintained, so it is not installed). https://github.com/emilkowalski/vaul
  MIT License — Copyright (c) 2023 Emil Kowalski.
- **sonner** — the toast countdown pause (`startTimer` / `pauseTimer`, paused
  while hovered, touched or the tab is hidden), in `src/components/ui/toast.tsx`.
  MIT License — Copyright (c) 2023 Emil Kowalski.
- **shadcn/ui** — the Progress fill moved by `translateX` instead of `width`,
  in `src/components/billing/shared.tsx`. MIT License — Copyright (c) 2023 shadcn.

Same permission notice as above. Idea only (GPL-3.0, no code copied): the
side-menu axis lock (the first clear axis wins) follows Telegram Web A
`src/util/captureEvents.ts` (github.com/Ajaxy/telegram-tt).

## Admin UX D1 (owner row 135, 2026-11-13)

### use-stick-to-bottom 1.1.6 — MIT (package)

The support conversation follows new messages only while the agent is at the
bottom (`src/components/support/thread-scroller.tsx`).
https://github.com/stackblitz-labs/use-stick-to-bottom

MIT License — Copyright (c) 2024 - present StackBlitz. Same permission notice as above.

### linkify-it 6.1.0, uc.micro 3.0.0 — MIT (packages)

Clickable links in support messages (`src/components/support/linkified-text.tsx`).
https://github.com/markdown-it/linkify-it · https://github.com/markdown-it/uc.micro

MIT License — linkify-it: Copyright (c) 2015 Vitaly Puzrin; uc.micro: Copyright Mathias Bynens. Same permission notice as above.

### next-navigation-guard 0.2.0 — MIT (code copied, no package added)

The unload and link-click interceptors of the unsaved-changes guard
(`src/lib/vendor/navigation-guard.ts`; changes marked «LawBid:»).
https://github.com/LayerXcom/next-navigation-guard

MIT License — Copyright (c) 2024 LayerX Inc. Same permission notice as above.

### react-zoom-pan-pinch 4.2.0 — MIT (formulas copied, no package added)

Wheel step, pinch scale and zoom-about-a-point of the document viewer
(`src/components/review/lightbox.tsx`). https://github.com/BetterTyped/react-zoom-pan-pinch

MIT License — Copyright (c) 2019 prc5. Same permission notice as above.

### PhotoSwipe 5.4.4 — MIT (rule copied, no package added)

The swipe-to-next-picture rule of the document viewer (`src/components/review/lightbox.tsx`).
https://github.com/dimsemenov/PhotoSwipe

MIT License — Copyright (c) 2014-2022 Dmitry Semenov. Same permission notice as above.

### cmdk 1.1.1 — MIT (pattern copied, no package added)

The highlighted row scrolled into view and IME-safe keys of the command palette
(`src/components/shell/command-palette.tsx`). https://github.com/pacocoursey/cmdk

MIT License — Copyright (c) 2022 Paco Coursey. Same permission notice as above.
