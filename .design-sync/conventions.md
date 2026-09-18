# Riffrec Live Overlay: conventions

These are the pieces of riffrec's live feedback overlay. It floats over a host
app while a person talks through changes. Use them to design the overlay's
states over a mock product page, not to build the product page.

- **Styling is inline, self-contained and quiet.** No tokens and no class
  names. White surfaces, `#101828` text, `#eaecf0` outer borders and `#f2f4f7`
  dividers, `0 1px 3px rgba(16,24,40,.06)` shadows, weight 500 (600 only for
  the wordmark and headings), 6px status dots, one dark primary per surface.
  The brand in copy is `/ce-polish live`, never "riffrec". Every control shows
  its single-key shortcut as a small chip. Several of them (`LiveIndicator`, `ModeSwitch`,
  `SendControl`, `KeyPrompt`, `Board`) inherit their font, so wrap them in a
  container with `font-family: Inter, ui-sans-serif, system-ui, sans-serif`.
- **Fixed-position pieces need a stage.** `ConsentDialog`, `DrawingLayer`,
  `PinComposer`, `LiveOverlay`, `LiveIndicator` and `NextSessionLauncher` use
  `position: fixed`. To show one inside a frame, put it in a container with
  `transform: translateZ(0)` and an explicit height. That makes the container
  the containing block.
- **`LiveOverlay` is the whole thing.** It takes a `LiveSession`
  (`LiveSession.create({ endpoint: null, bootstrap: null, storage: null,
  pageHideTarget: null, mode: "smart" })`). To drive its states, call
  `session.start()`, `session.beginConsent()`, `session.recordUnit({...})` and
  `session.voiceUnavailable({...})`. Use the leaf components when you only need
  one state.
- **Modes** are `"instant"`, `"smart"` and `"collect"` (see `ModeSwitch`).
  **Units** are the statements the person asked for, with statuses shown on the
  `Board`.
- **Pins are numbered markers** that point at page elements. Keep them off the
  text they annotate.
- **Copy is part of the contract.** The start flow's step 2 lists exactly what
  is shared with whom, recomputed from the step-1 switches. Don't paraphrase it.
- **One page tool at a time.** The bottom toolbar picks Cursor, Draw or Pin;
  Draw and Pin turn the button and caption red and outline the page.

