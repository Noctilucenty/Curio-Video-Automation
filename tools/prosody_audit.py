#!/usr/bin/env python3
"""Prosody audit — the engine's ear for "one connected thought" vs a LIST read.

Praat (parselmouth) pitch + intensity measured against the take's word timings.
Per sentence it reports opening F0, closing F0, range, the gap to the next
sentence, and the STEP between one sentence's final pitch and the next
sentence's opening pitch.

A read that FLOWS carries declination across boundaries: small steps, varied
gaps, long sentences. A read that sounds like a LIST resets to the same opening
pitch every sentence (large positive steps), uses uniform gaps, and is built
from short fact-card sentences.

Why this exists: Leon heard "not continuous flow" on the founder engine's E01
and no automated check could say why. This instrument proved it objectively
(22 sentences averaging 5.5 words; 15 of 21 boundaries hard pitch resets back
to the same ~148 Hz). Ported here so THIS engine can hear the same defect
before a master is built, not after a human catches it.

Doctrine anchors:
  - PRODUCTION_DOCTRINE 59 (LOCKED): never flatten pause variation; report
    pause-variation std before and after any timing edit — a drop is a defect.
  - VIRAL_PLAYBOOK: uniform sentence gaps read as a list; pause variation is
    the only measurable proxy for "one thought"; pick the TTS take with the
    FEWEST boundary pauses.
  - PENDING_LESSONS P-35 (HARD RULE): never assert an acoustic finding from an
    instrument that did not actually measure. Hence COVERAGE below: an
    unmeasurable boundary is never silently scored as a pass.

Usage:
  prosody_audit.py <audio> [words.json] [--gate] [--json out.json]
  prosody_audit.py --compare <take1.wav> <take2.wav> ...

  <audio> may be .wav/.mp3/.m4a/.mp4 — anything ffmpeg decodes.
  words.json is optional: falls back to "<stem>-words.json", then to a local
  whisper.cpp transcription (no network, no OpenAI key).

Exit codes (only meaningful with --gate): 0 pass, 1 fail, 2 usage/input error.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
import parselmouth

# --- gate thresholds -------------------------------------------------------
# Evidence tiers matter (CLAUDE.md): only the pause-variation floor is derived
# from a LOCKED doctrine rule. The pitch-reset ratio is PROVISIONAL — it is
# built on two productions and is reported as a WARN, never a hard block,
# until REP-1/2/3-class evidence supports promoting it.

GAP_STD_FLOOR = 0.070      # FAIL below. Measured defects: 0.066s
                           # (MICROGRAVITY-FLAME, doctrine 59) and 0.053s
                           # (founder E01 v4). Measured healthy: 0.095-0.202s.
WORDS_PER_SENTENCE_FLOOR = 8.0   # FAIL below: fact-card structure is the list
                                 # at its source (doctrine 59 corollary).
HARD_RESET_HZ = 12.0       # A boundary step above this is a "hard reset".
HARD_RESET_RATIO_WARN = 0.50     # WARN above, of MEASURABLE boundaries.
                                 # E01 v4 defect: 15/21 = 0.71. Fixed: 0/5.
COVERAGE_FLOOR = 0.60      # Below this the pitch verdict is UNMEASURABLE.

PITCH_FLOOR_HZ = 70.0
PITCH_CEILING_HZ = 320.0
EDGE_WINDOW_S = 0.35       # Nominal head/tail window for opening/closing F0.
EDGE_WINDOW_MAX_S = 0.60   # Expand to this hunting for voiced frames.
MIN_VOICED_FRAMES = 3      # Fewer than this = not measured, not "zero".

WHISPER_MODEL = os.environ.get(
    "WHISPER_MODEL",
    str(Path.home() / ".cache/whisper.cpp/ggml-large-v3-turbo-q5_0.bin"),
)
TAG_RE = re.compile(r"^\[[^\]]*\]$")          # eleven_v3 emotion tags (L-19)
SENTENCE_END_RE = re.compile(r"[.!?][\"')\]]*$")


# --- input ----------------------------------------------------------------

def decode_to_wav(src: Path, tmpdir: str) -> Path:
    """Any ffmpeg-readable input -> mono 16 kHz wav (also what whisper wants)."""
    if src.suffix.lower() == ".wav":
        return src
    out = Path(tmpdir) / f"{src.stem}-decoded.wav"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
         "-ac", "1", "-ar", "16000", str(out)],
        check=True, capture_output=True,
    )
    return out


def load_words(path: Path) -> list[list]:
    """Accept {"words": [...]} or a bare list; rows as [text, start, end] or dicts."""
    data = json.load(open(path))
    rows = data["words"] if isinstance(data, dict) and "words" in data else data
    out = []
    for r in rows:
        if isinstance(r, dict):
            text = r.get("word", r.get("text", ""))
            start, end = r.get("start"), r.get("end")
        else:
            text, start, end = r[0], r[1], r[2]
        if start is None or end is None:
            continue
        out.append([str(text), float(start), float(end)])
    return out


def strip_tags(words: list[list]) -> tuple[list[list], int]:
    """Drop eleven_v3 bracketed emotion tags (L-19).

    They arrive as real tokens with their own timings and would otherwise
    corrupt word counts, WPM and — worse — invent a sentence boundary.
    """
    kept = [w for w in words if not TAG_RE.match(w[0].strip())]
    return kept, len(words) - len(kept)


def whisper_words(wav: Path, tmpdir: str) -> list[list]:
    """Local word timings via whisper.cpp — so a master with no words.json is
    still measurable. No network, no OpenAI key (CLAUDE.md: ASR runs locally)."""
    if not Path(WHISPER_MODEL).exists():
        raise FileNotFoundError(
            f"whisper model not found at {WHISPER_MODEL}; set WHISPER_MODEL")
    stem = Path(tmpdir) / wav.stem
    subprocess.run(
        ["whisper-cli", "-m", WHISPER_MODEL, "-f", str(wav),
         "--output-json-full", "--split-on-word", "--max-len", "1",
         "--no-prints", "-of", str(stem)],
        check=True, capture_output=True,
    )
    data = json.load(open(f"{stem}.json"))
    out = []
    for seg in data.get("transcription", []):
        text = seg.get("text", "").strip()
        off = seg.get("offsets", {})
        if not text or "from" not in off:
            continue
        out.append([text, off["from"] / 1000.0, off["to"] / 1000.0])
    return out


def resolve_words(audio: Path, explicit: Path | None, tmpdir: str,
                  wav: Path) -> tuple[list[list], str]:
    if explicit:
        return load_words(explicit), str(explicit)
    sibling = audio.with_name(f"{audio.stem}-words.json")
    if sibling.exists():
        return load_words(sibling), str(sibling)
    return whisper_words(wav, tmpdir), "whisper.cpp (derived)"


# --- measurement ----------------------------------------------------------

def split_sentences(words: list[list]) -> list[list[list]]:
    out, cur = [], []
    for w in words:
        cur.append(w)
        if SENTENCE_END_RE.search(w[0].strip()):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


class Track:
    """F0 + intensity over the take, with an explicit notion of 'unmeasurable'."""

    def __init__(self, wav: Path):
        snd = parselmouth.Sound(str(wav))
        self.duration = float(snd.duration)
        pitch = snd.to_pitch(time_step=0.01, pitch_floor=PITCH_FLOOR_HZ,
                             pitch_ceiling=PITCH_CEILING_HZ)
        f0 = pitch.selected_array["frequency"].copy()
        f0[f0 == 0] = np.nan
        self.f0, self.t = f0, pitch.xs()
        inten = snd.to_intensity(minimum_pitch=PITCH_FLOOR_HZ, time_step=0.01)
        self.it, self.iv = inten.xs(), inten.values[0]

    def voiced(self, a: float, b: float) -> np.ndarray:
        m = (self.t >= a) & (self.t <= b)
        v = self.f0[m]
        return v[~np.isnan(v)]

    def edge_f0(self, a: float, b: float, head: bool) -> float:
        """Median F0 at a sentence edge, expanding the window until enough
        voiced frames exist. Returns nan if the edge is genuinely unmeasurable
        (e.g. a sentence ending on an unvoiced cluster like 'undressed')."""
        span = max(b - a, 0.0)
        if span <= 0:
            return float("nan")
        ceiling = min(EDGE_WINDOW_MAX_S, span)
        width = min(EDGE_WINDOW_S, span)
        while True:
            lo, hi = (a, a + width) if head else (b - width, b)
            v = self.voiced(lo, hi)
            if v.size >= MIN_VOICED_FRAMES:
                return float(np.median(v))
            if width >= ceiling:
                return float("nan")
            width = min(width + 0.10, ceiling)


def audit(wav: Path, words: list[list]) -> dict:
    track = Track(wav)

    # A words.json from a DIFFERENT cut (or with a lead-in offset) would place
    # every F0 window on the wrong audio and yield confident nonsense. Refuse
    # rather than measure the wrong thing.
    if words[-1][2] > track.duration + 0.25:
        raise ValueError(
            f"word timings run to {words[-1][2]:.2f}s but the audio is only "
            f"{track.duration:.2f}s — wrong words.json for this cut, or the "
            f"narration is offset in the mix")

    sents = split_sentences(words)
    rows, gaps = [], []

    for i, s in enumerate(sents):
        a, b = s[0][1], s[-1][2]
        opening = track.edge_f0(a, b, head=True)
        closing = track.edge_f0(a, b, head=False)
        allv = track.voiced(a, b)
        rows.append({
            "index": i,
            "start": round(a, 3),
            "end": round(b, 3),
            "text": " ".join(w[0] for w in s),
            "words": len(s),
            "f0_open_hz": None if np.isnan(opening) else round(opening, 1),
            "f0_close_hz": None if np.isnan(closing) else round(closing, 1),
            "f0_range_hz": round(float(allv.max() - allv.min()), 1) if allv.size else None,
        })
        if i + 1 < len(sents):
            gaps.append(round(sents[i + 1][0][1] - b, 4))

    # boundary steps: next sentence's opening F0 minus this one's closing F0
    boundaries = []
    for i in range(len(sents) - 1):
        close, nxt_open = rows[i]["f0_close_hz"], rows[i + 1]["f0_open_hz"]
        measurable = close is not None and nxt_open is not None
        step = round(nxt_open - close, 1) if measurable else None
        boundaries.append({
            "index": i,
            "gap_s": gaps[i],
            "step_hz": step,
            "measurable": measurable,
            # A boundary we could not measure is NOT a passing boundary.
            "hard_reset": bool(measurable and step > HARD_RESET_HZ),
        })

    measured = [b for b in boundaries if b["measurable"]]
    hard = [b for b in measured if b["hard_reset"]]
    coverage = len(measured) / len(boundaries) if boundaries else 1.0

    # Gaps are only real when the timings came from FORCED ALIGNMENT. ASR
    # segment timings (whisper --max-len 1) are contiguous by construction —
    # every gap is exactly 0.000 — which would otherwise read as a total
    # pause collapse and fire a false doctrine-59 failure (P-35 error class).
    gaps_reliable = bool(gaps) and sum(1 for g in gaps if abs(g) < 0.001) / len(gaps) <= 0.9

    opens = np.array([r["f0_open_hz"] for r in rows if r["f0_open_hz"] is not None], float)
    steps = np.array([b["step_hz"] for b in measured], float)
    gap_arr = np.array(gaps, float)
    wps = float(np.mean([r["words"] for r in rows])) if rows else 0.0

    # intensity floor in each inter-sentence gap: deep uniform floors mean
    # silence-separated cards rather than one continuous breath.
    floors = []
    for i, b in enumerate(boundaries):
        end = rows[i]["end"]
        m = (track.it >= end) & (track.it <= end + max(b["gap_s"], 0.01))
        if m.any():
            floors.append(float(np.min(track.iv[m])))

    return {
        "sentences": rows,
        "boundaries": boundaries,
        "metrics": {
            "sentence_count": len(rows),
            "words_per_sentence": round(wps, 1),
            "f0_open_mean_hz": round(float(opens.mean()), 1) if opens.size else None,
            "f0_open_std_hz": round(float(opens.std()), 1) if opens.size else None,
            "step_mean_hz": round(float(steps.mean()), 1) if steps.size else None,
            "step_std_hz": round(float(steps.std()), 1) if steps.size else None,
            "hard_resets": len(hard),
            "measurable_boundaries": len(measured),
            "total_boundaries": len(boundaries),
            "hard_reset_ratio": round(len(hard) / len(measured), 3) if measured else None,
            "coverage": round(coverage, 3),
            "gaps_reliable": gaps_reliable,
            "gap_mean_s": round(float(gap_arr.mean()), 4) if gap_arr.size else None,
            "gap_std_s": round(float(gap_arr.std()), 4) if gap_arr.size else None,
            "gap_min_s": round(float(gap_arr.min()), 4) if gap_arr.size else None,
            "gap_max_s": round(float(gap_arr.max()), 4) if gap_arr.size else None,
            "intensity_floor_mean_db": round(float(np.mean(floors)), 1) if floors else None,
        },
    }


def verdict(metrics: dict) -> dict:
    """Separate HARD failures (locked doctrine) from PROVISIONAL warnings."""
    failures, warnings, notes = [], [], []

    gap_std = metrics["gap_std_s"]
    if gap_std is None:
        pass
    elif not metrics["gaps_reliable"]:
        warnings.append(
            "pause variation UNMEASURABLE: word timings are contiguous (ASR segment "
            "timings, not forced alignment) so inter-sentence gaps are 0 by "
            "construction — supply the take's words.json to gate doctrine 59")
    elif gap_std < GAP_STD_FLOOR:
        failures.append(
            f"pause variation collapsed: gap std {gap_std:.3f}s < "
            f"{GAP_STD_FLOOR:.3f}s floor (doctrine 59 — uniform gaps read as a list)")
    else:
        notes.append(f"pause variation OK: gap std {gap_std:.3f}s")

    wps = metrics["words_per_sentence"]
    if metrics["sentence_count"] and wps < WORDS_PER_SENTENCE_FLOOR:
        failures.append(
            f"fact-card structure: {wps:.1f} words/sentence < "
            f"{WORDS_PER_SENTENCE_FLOOR:.0f} floor (the list at its source)")

    ratio, coverage = metrics["hard_reset_ratio"], metrics["coverage"]
    if metrics["total_boundaries"] == 0:
        notes.append("single sentence — no boundaries to measure")
    elif coverage < COVERAGE_FLOOR:
        warnings.append(
            f"pitch-reset verdict UNMEASURABLE: only {metrics['measurable_boundaries']}"
            f"/{metrics['total_boundaries']} boundaries carried voiced F0 at both edges "
            f"(coverage {coverage:.0%} < {COVERAGE_FLOOR:.0%}) — P-35: not a pass")
    elif ratio is not None and ratio > HARD_RESET_RATIO_WARN:
        warnings.append(
            f"list-read signature (PROVISIONAL): {metrics['hard_resets']}/"
            f"{metrics['measurable_boundaries']} measurable boundaries are hard pitch "
            f"resets > +{HARD_RESET_HZ:.0f} Hz (mean {metrics['step_mean_hz']:+.1f} Hz)")
    elif ratio is not None:
        notes.append(
            f"pitch flow OK: {metrics['hard_resets']}/{metrics['measurable_boundaries']}"
            f" hard resets")

    return {
        "verdict": "fail" if failures else ("warn" if warnings else "pass"),
        "failures": failures,
        "warnings": warnings,
        "notes": notes,
    }


# --- reporting ------------------------------------------------------------

def fmt(v, spec: str, dash: str = "—") -> str:
    return dash.rjust(len(format(0, spec))) if v is None else format(v, spec)


def report(result: dict, label: str) -> None:
    m = result["metrics"]
    print(f"\n=== PROSODY AUDIT — {label} ===")
    print(f"{'#':>2} {'start':>6} {'end':>6} {'text':<44} {'open':>7} {'close':>7} "
          f"{'range':>6} {'gap→':>7} {'STEP':>7}")
    for i, r in enumerate(result["sentences"]):
        b = result["boundaries"][i] if i < len(result["boundaries"]) else None
        gap = fmt(b["gap_s"] if b else None, "7.3f")
        step = fmt(b["step_hz"] if b else None, "+7.1f")
        if b and not b["measurable"]:
            step = "unmeas".rjust(7)
        print(f"{r['index']:>2} {r['start']:6.2f} {r['end']:6.2f} {r['text'][:44]:<44} "
              f"{fmt(r['f0_open_hz'], '7.1f')} {fmt(r['f0_close_hz'], '7.1f')} "
              f"{fmt(r['f0_range_hz'], '6.1f')} {gap} {step}")

    print("\n--- FLOW DIAGNOSTICS ---")
    print(f"sentences: {m['sentence_count']}, mean words/sentence: {m['words_per_sentence']}"
          f"   (< {WORDS_PER_SENTENCE_FLOOR:.0f} = fact-card structure)")
    print(f"sentence-start F0: mean {fmt(m['f0_open_mean_hz'], '.1f')} Hz, "
          f"std {fmt(m['f0_open_std_hz'], '.1f')} Hz"
          f"   (LOW std = every sentence resets to the same pitch)")
    print(f"boundary STEP: mean {fmt(m['step_mean_hz'], '+.1f')} Hz, "
          f"std {fmt(m['step_std_hz'], '.1f')}   (large positive = hard resets)")
    print(f"hard resets (> +{HARD_RESET_HZ:.0f} Hz): {m['hard_resets']} of "
          f"{m['measurable_boundaries']} MEASURABLE boundaries "
          f"({m['total_boundaries']} total, coverage {m['coverage']:.0%})")
    gap_note = ("(LOW std = mechanical rhythm)" if m["gaps_reliable"]
                else "(UNRELIABLE — contiguous ASR timings, not forced alignment)")
    print(f"sentence gaps: mean {fmt(m['gap_mean_s'], '.3f')}s, "
          f"std {fmt(m['gap_std_s'], '.3f')}s, min {fmt(m['gap_min_s'], '.3f')}, "
          f"max {fmt(m['gap_max_s'], '.3f')}   {gap_note}")
    if m["intensity_floor_mean_db"] is not None:
        print(f"inter-sentence intensity floor: mean {m['intensity_floor_mean_db']} dB"
              f"   (deep uniform floors = silence-separated cards)")

    v = result["gate"]
    print()
    for f in v["failures"]:
        print(f"FAIL  {f}")
    for w in v["warnings"]:
        print(f"WARN  {w}")
    for n in v["notes"]:
        print(f"PASS  {n}")
    print(f"\nPROSODY: {v['verdict'].upper()}")


def analyse(audio: Path, words_path: Path | None) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        wav = decode_to_wav(audio, tmp)
        words, source = resolve_words(audio, words_path, tmp, wav)
        words, dropped = strip_tags(words)
        if not words:
            raise ValueError(f"no usable word timings for {audio}")
        result = audit(wav, words)
    result["input"] = {
        "audio": str(audio),
        "words_source": source,
        "word_count": len(words),
        "emotion_tags_stripped": dropped,
    }
    result["gate"] = verdict(result["metrics"])
    return result


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio", nargs="+", help="audio/video file(s)")
    ap.add_argument("words", nargs="?", default=None,
                    help="words.json (single-file mode only)")
    ap.add_argument("--compare", action="store_true",
                    help="rank several takes by connectedness")
    ap.add_argument("--gate", action="store_true",
                    help="exit non-zero on a hard failure")
    ap.add_argument("--json", dest="json_out", default=None, help="write JSON report")
    ap.add_argument("--quiet", action="store_true", help="suppress the table")
    args = ap.parse_args()

    # single-file positional form: prosody_audit.py a.wav a-words.json
    audios = [Path(a) for a in args.audio]
    words_path = Path(args.words) if args.words else None
    if not args.compare and words_path is None and len(audios) == 2 \
            and audios[1].suffix.lower() == ".json":
        audios, words_path = audios[:1], audios[1]

    results = []
    for a in audios:
        if not a.exists():
            print(f"error: no such file: {a}", file=sys.stderr)
            return 2
        try:
            r = analyse(a, words_path if len(audios) == 1 else None)
        except Exception as exc:  # noqa: BLE001 — report, never mask
            print(f"error: {a.name}: {exc}", file=sys.stderr)
            return 2
        results.append(r)
        if not args.quiet:
            report(r, a.name)

    if args.compare and len(results) > 1:
        print("\n=== TAKE COMPARISON (most connected first) ===")
        print(f"{'take':<34} {'gap std':>8} {'w/sent':>7} {'resets':>9} {'cover':>6} {'verdict':>8}")
        # Playbook: the take with the fewest boundary resets and the most gap
        # variation is the most connected. Unmeasurable coverage sorts last —
        # it is not evidence of flow.
        ranked = sorted(results, key=lambda r: (
            r["metrics"]["hard_reset_ratio"] if r["metrics"]["hard_reset_ratio"] is not None else 9,
            -(r["metrics"]["gap_std_s"] or 0),
        ))
        for r in ranked:
            m = r["metrics"]
            print(f"{Path(r['input']['audio']).name:<34} "
                  f"{fmt(m['gap_std_s'], '8.3f')} {m['words_per_sentence']:>7.1f} "
                  f"{m['hard_resets']:>4}/{m['measurable_boundaries']:<4} "
                  f"{m['coverage']:>5.0%} {r['gate']['verdict']:>8}")

    if args.json_out:
        payload = results[0] if len(results) == 1 else {"takes": results}
        Path(args.json_out).write_text(json.dumps(payload, indent=2))
        print(f"\nJSON report: {args.json_out}")

    if args.gate and any(r["gate"]["verdict"] == "fail" for r in results):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
