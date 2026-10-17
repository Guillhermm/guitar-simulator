# Guitar Simulator

A classical guitar you play in the browser. Six strings in standard tuning (E2 A2 D3 G3 B3 E4), open plus nineteen frets on a 650 mm scale, with frets spaced by twelve-tone equal temperament. The drawing follows real classical-guitar proportions: a tapering fretboard, strings that fan out from the nut to the saddle, a slotted headstock with rollers, a tie-block bridge and a rosette around the sound hole.

## Run it

```sh
npm run serve
```

Then open <http://127.0.0.1:8417>. ES modules do not load from `file://`, so a local server is needed. There is no build step and there are no dependencies: the browser loads `index.html`, `styles.css` and `src/` as they are.

`tools/serve.py` is `python3 -m http.server` plus `Cache-Control: no-store`. Without it a browser keeps reusing modules it fetched earlier, so an edited file only shows up after a hard reload, and a module another project cached under the same origin can load instead. The port, 8417, is this project's own for the same reason: the other projects serve on 8000 with the same paths (`/src/main.js`). Versioning the module URLs in `index.html` would not help: `src/main.js?v=2` still imports `./audio.js` unversioned, and an import map would need an inline script that the Content Security Policy blocks.

## Play it

- Click or tap a string between two fret wires to play that fret; left of the nut, or on the body past fret 19, plays it open. Hit areas follow the fanned strings.
- Drag (mouse button down or a finger) across the strings to strum: each string plays once when the pointer crosses it, at the fret under the pointer, in the order crossed. Moving along a string plays nothing; crossing back plays again. Crossings are found geometrically on the segment between pointer events, so a fast strum still plays every string. Each pointer tracks its own path, and touch scrolling and zooming are disabled on the guitar.
- Keyboard: Tab or Up/Down picks a string, Left/Right/Home/End picks a fret, Space or Enter plucks.

## Tablature

The dock under the guitar holds a tab: write it, play it back on the guitar, open and save it. It is a fixed 3.5 rem bar along the bottom (Play, Back to start, tempo, the tools, and a toggle at the far right) with a 14 rem body above it that holds the editor. The buttons are icons with a tooltip and an accessible name; Undo keeps its word.

- **Format**: plain ASCII tab, six lines per block from high e to low E, one character column per sixteenth note. A line may start with its string name and a bar (`e|`, `B|`) or just a bar; a bare line with no label and no bar counts only if it holds a fret, so an all-dash line of that kind ends the block. Consecutive tab lines form blocks of six, played one after another. Text after the closing bar, set off by a space (`| (3x)`, `|  x2`), is a note to the reader: the line still counts as tab, the text is kept and nothing repeats. Everything else (chord names, lyrics, notes) is kept but not played, so a tab page pasted whole from a site works. Notes whose digits overlap in time sound together: a 3 written under the second digit of a 12 on another string is part of the same chord. Frets above 19 are skipped and counted in the status line.
- **Techniques**: written the usual way, on the string's line.

  | Write | Technique | How it sounds |
  |---|---|---|
  | `5h7`, `7p5` | hammer-on, pull-off | the ringing string changes pitch, no new pluck |
  | `5/7`, `7\5` | slide between two notes | one ringing note stepping fret by fret into the next |
  | `/5`, `5/` (and `\`) | slide in, slide out | three frets from below or above into the note, or away from it |
  | `8b10`, `8b10r8`, `8b` | bend, bend and release | the pitch rises to the target over 0.12 s, starting one column after the note; no target is a whole step. The target is not a note |
  | `7~~~` | vibrato | a 5.5 Hz wobble of 30 cents, fading in |
  | `x` | muted note | a short, quieter click |
  | `(5)` | ghost note | the note at about a third of the level |
  | `<12>`, `<7>`, `<5>`, `<4>`, `<9>`, `<19>` | natural harmonic | a bell-like tone, the octave, twelfth or higher over the open string |
  | `PM----` on the line above a block | palm mute | the notes under the dashes ring short |

  A new note on a string stops the one still ringing there, as a finger would. The text editor can write all of these; the grid editor writes frets only and shows a muted note as `x`.
- **Tempo**: a `Tempo: 120` line anywhere in the text sets the beats per minute; without one it is 80. The BPM field edits that line, between 40 and 240.
- **Header lines**: a tab can carry `Title: …`, `Artist: …` and `Arranged by: …` lines alongside `Tempo:`. The key is case-insensitive, spaces may sit around the key and the colon, and the colon is required: without it the line is ordinary text, so a lyric starting with "Artist" is never a header. The value is trimmed, runs of whitespace collapse to one space, control and format characters (including bidi overrides) are dropped, it is cut at 200 characters, and an empty value counts as missing. If a key appears twice the first line wins and later ones stay plain text. Writing a field rewrites that first line or inserts it at the top in the order Title, Artist, Arranged by, Tempo; clearing a field removes its line. Header lines are never tab lines, and nothing is guessed from a first line such as `Artist - Title`. A file without them opens, plays and autosaves as before.
- **Editors**: two are on trial over the same text, picked with the Text | Grid switch in the tools (two radios). Text is a textarea; Grid is a cell grid: type a fret (a 1 waits 600 ms for a second digit, for 10 to 19), arrows move, Space writes a rest, Backspace clears. Switching rebuilds the editor from the text and keeps the cue and, while playing, the playhead; the old `?editor=` address parameter is gone. In either one, pressing a fret on the guitar while the editor has focus writes that note at the cursor and moves on.
- **Playing**: Play (or Ctrl/Cmd+Enter) plays the tab from the cursor and shows each note on the guitar as it sounds. The cursor is the text caret or the grid cell; on a lyric, chord or blank line it means the first block below, and above every block it means the start. Stop cancels the notes not yet started, mutes the strings still ringing and leaves the cursor at the step that was sounding, so the next Play resumes there; when the song ends the cursor goes back to the first step. The Back button (Back to start, or Ctrl/Cmd+Home) puts the cursor at step 0, and restarts from there while playing. The playhead moves during playback but the cursor does not. The chevron at the right end of the bar collapses the body and the tools, leaving only Play, Back and the tempo; collapsing slides the body down (320 ms to open, 240 ms to close, none under `prefers-reduced-motion`) and the guitar grows to fill the free space (collapsed it is as large as the window allows, open it shrinks and moves up to sit above the body, on the same timing, with its proportions untouched; the scale is computed in `src/stage-fit.js`). Escape does nothing to the dock, so the text editor keeps it. On a portrait phone the tools sit in a row above the bar and the upright guitar shrinks to fit above the sheet, with the hint and credit pinned just above it; in a short landscape window the bar becomes a rail on the right edge and the body slides in from it.
- **Clear**: stops playback and replaces the text with an empty tab, keeping the Tempo line if there was one, and puts the cursor at step 0. An Undo button in the status line restores the previous text for 8 seconds. It is disabled when the text is already an empty tab.
- **Remembered**: the editor choice and whether the dock is open are saved in the browser under `guitar-simulator.ui.v1`, apart from the tab text. Without a saved value the dock starts open, except on a portrait phone, where it starts collapsed, and the editor is Text.
- **Credit**: a line under the hint reads "Made by Guilherme Almeida Zeni with AI agents." with links to LinkedIn, GitHub and a profile site, each opening in a new tab.
- **Files**: Open loads a `.txt` file of up to 256 KB, also by dropping it on the dock; Save downloads the tab as `Title - Artist YYYY-MM-DD_HHMMSS.txt` (local time; the artist part is left out when missing, and an empty title gives `Untitled`). The text is saved in the browser as you type and comes back on the next visit.

## How the sound is made

Nothing is sampled. Each note is synthesized with the Karplus-Strong plucked-string algorithm (`src/pluck.js`): a burst of noise circulates in a delay line one period long, and a lowpass in the loop takes the high harmonics out faster than the low ones, the way a real string loses its brightness. A first-order allpass supplies the fractional part of the delay, so pitch is not rounded to whole samples; every note lands within a cent of equal temperament. Notes are rendered once into an `AudioBuffer`, cached per note and kind, and played through a gain and a limiter (`src/audio.js`). Notes on different strings overlap, so chords ring.

Each string has one voice. Hammer-ons, pull-offs, slides and bends do not start a new note: they change the playback rate of the voice already ringing, so the string keeps its energy. Vibrato is an oscillator on the voice's detune. Muted and palm-muted notes are the same string model with a shorter decay; a harmonic is a few sine partials with a long one. The schedule of all of this (when each voice starts, glides and is cut) is computed ahead by `planNotes` in `src/scheduler.js`, and the audio and the guitar drawing both follow it.

The audio context is created on the first press, inside the user gesture, because browsers block audio until the page is touched.

## Test

```sh
npm test
```

Uses Node's built-in test runner, checked on Node 24. The CSS, the animation and the layouts at desktop, phone and short-landscape size are checked by hand in a browser, not by the suite. `test/smoke.test.js` loads `src/main.js` against a stand-in DOM, so a module that throws on page load fails the suite. The real tabs in `../tabs/` are checked when that folder exists next to the repo, and skipped otherwise.
