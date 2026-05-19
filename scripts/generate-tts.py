#!/usr/bin/env python3
"""
scripts/generate-tts.py

Pre-generates natural-sounding TTS audio for the Namibia PWA using
Microsoft Edge's voices via the `edge-tts` Python library (free, no API key).

For each canned ttsKey (sunset warnings, fuel/pressure cues) AND each step
ttsKey already encoded into the cached route data, generates an MP3 file at
  tts-cache/<sha256-of-text>.mp3
and writes a manifest at
  tts-cache/manifest.json
mapping ttsKey -> filename.

The PWA's v14 NamibiaTTS.speak() will check this manifest BEFORE falling back
to Google Cloud TTS or speechSynthesis, so audio sounds far more natural and
works fully offline once these MP3s are bundled.

Usage:
  python3 scripts/generate-tts.py            # generate everything missing
  python3 scripts/generate-tts.py --force    # regenerate everything
  python3 scripts/generate-tts.py --voice "en-US-GuyNeural"

Requires: pip install edge-tts
"""

import argparse
import asyncio
import hashlib
import json
import re
import sys
from pathlib import Path

try:
    import edge_tts
except ImportError:
    print("edge-tts not installed. Run: pip install edge-tts", file=sys.stderr)
    sys.exit(1)


ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / 'tts-cache'
MANIFEST_PATH = CACHE_DIR / 'manifest.json'

# These mirror the CANNED set in pwa-v14-tts-offline.js. Keep in sync.
CANNED = {
    'sunset_risk_warning':
        'Warning: you are at risk of arriving after sunset. Driving after '
        'dark is not permitted in Namibia. Consider stopping at the next '
        'safe town.',
    'sunset_risk_tight':
        'Caution: arrival is close to sunset. Maintain current pace and do '
        'not stop for long.',
    'pressure_lower':
        'Tyre pressure action coming up. Lower pressure before the next '
        'section.',
    'pressure_raise':
        'Tyre pressure action coming up. Raise pressure for the upcoming road.',
    'fuel_stop':
        'Fuel stop coming up. Top up before the next remote section.',
}


def sha(s: str) -> str:
    return hashlib.sha256(s.encode('utf-8')).hexdigest()[:24]


def collect_step_keys() -> dict:
    """Read data.js, extract every step instruction we'd want spoken, and
    return a {ttsKey: text} map. Uses the same generation logic as v12's
    ttsTextFor (mirror it in Python)."""
    data_path = ROOT / 'data.js'
    raw = data_path.read_text(encoding='utf-8')
    # Strip "window.NAMIBIA_TRIP_DATA = " prefix and trailing semicolon
    m = re.search(r'\{[\s\S]*\}', raw)
    if not m:
        return {}
    data = json.loads(m.group(0))
    out = {}
    for d in data.get('days', []):
        for s in d.get('stops', []):
            # Pre-generate stop-level announcements ("Arriving at Solitaire", etc.)
            key = f"stop:{s.get('name', '')}"
            txt = f"Arriving at {s.get('name', '')}."
            out[key] = txt
    return out


async def synth_one(text: str, dest: Path, voice: str):
    communicate = edge_tts.Communicate(text=text, voice=voice)
    await communicate.save(str(dest))


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--voice', default='en-US-AvaNeural',
                        help='Edge TTS voice (default: en-US-AvaNeural). '
                             'Try en-US-GuyNeural, en-GB-SoniaNeural, etc.')
    parser.add_argument('--force', action='store_true', help='Regenerate all')
    args = parser.parse_args()

    CACHE_DIR.mkdir(exist_ok=True)
    manifest = {}
    if MANIFEST_PATH.exists() and not args.force:
        try:
            manifest = json.loads(MANIFEST_PATH.read_text())
        except Exception:
            manifest = {}

    # Build the full ttsKey → text map.
    all_keys = dict(CANNED)
    all_keys.update(collect_step_keys())

    print(f"{len(all_keys)} ttsKeys to consider, voice={args.voice}")
    new_count, skip_count, err_count = 0, 0, 0

    for ttsKey, text in all_keys.items():
        filename = sha(text) + '.mp3'
        out_path = CACHE_DIR / filename
        # Manifest binds ttsKey to filename; skip if up-to-date.
        if not args.force and manifest.get(ttsKey, {}).get('file') == filename and out_path.exists():
            skip_count += 1
            continue
        try:
            await synth_one(text, out_path, args.voice)
            manifest[ttsKey] = {'file': filename, 'text': text, 'voice': args.voice}
            new_count += 1
            print(f"  ✓ {ttsKey} → {filename} ({len(text)} chars)")
        except Exception as e:
            err_count += 1
            print(f"  ✗ {ttsKey}: {e}", file=sys.stderr)

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, sort_keys=True))
    print(f"\nDone. New: {new_count}  Skipped: {skip_count}  Errors: {err_count}")
    print(f"Manifest: {MANIFEST_PATH.relative_to(ROOT)}")


if __name__ == '__main__':
    asyncio.run(main())
