#!/usr/bin/env python3
"""Build static voting results and spectrogram assets for GitHub Pages."""

from __future__ import annotations

import argparse
import csv
import json
import math
import shutil
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import soundfile as sf
from scipy.signal import stft


SITE_ROOT = Path(__file__).resolve().parent
MOS_ROOT = SITE_ROOT.parent
DEFAULT_VOTES = MOS_ROOT / "anyan_api/exports/pairwise_35_votes.tsv"
DEFAULT_SURVEY = MOS_ROOT / "anyan_api/survey_data/pairwise_demo.json"
DEFAULT_AUDIO_ROOT = MOS_ROOT / "anyan_api/survey_data"


@dataclass
class VoteStats:
    page: int
    fileid: str
    wins_16k: int = 0
    wins_48k: int = 0

    @property
    def total(self) -> int:
        return self.wins_16k + self.wins_48k

    @property
    def rate_48k(self) -> float:
        return self.wins_48k / self.total if self.total else 0.0

    @property
    def margin_48k(self) -> int:
        return self.wins_48k - self.wins_16k

    def as_dict(self) -> dict[str, object]:
        return {
            "page": self.page,
            "question": self.page + 1,
            "fileid": self.fileid,
            "wins16k": self.wins_16k,
            "wins48k": self.wins_48k,
            "total": self.total,
            "rate48k": round(self.rate_48k * 100, 1),
            "margin48k": self.margin_48k,
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--votes", type=Path, default=DEFAULT_VOTES)
    parser.add_argument("--survey", type=Path, default=DEFAULT_SURVEY)
    parser.add_argument("--audio-root", type=Path, default=DEFAULT_AUDIO_ROOT)
    parser.add_argument("--survey-id", type=int, default=35)
    parser.add_argument("--top-k", type=int, default=5)
    return parser.parse_args()


def load_votes(path: Path) -> tuple[list[VoteStats], set[str]]:
    by_file: dict[str, VoteStats] = {}
    participants: set[str] = set()
    with path.open("r", encoding="utf-8", newline="") as stream:
        reader = csv.DictReader(stream, delimiter="\t")
        required = {"email", "page", "fileid", "winner_rate"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"{path} is missing columns: {', '.join(sorted(missing))}")
        for row_number, row in enumerate(reader, 2):
            winner = row["winner_rate"]
            if winner not in {"16k", "48k"}:
                raise ValueError(f"{path}:{row_number}: unsupported winner_rate {winner!r}")
            participants.add(row["email"])
            page = int(row["page"])
            fileid = row["fileid"]
            current = by_file.setdefault(fileid, VoteStats(page=page, fileid=fileid))
            if current.page != page:
                raise ValueError(f"{fileid} appears on multiple pages")
            if winner == "16k":
                current.wins_16k += 1
            else:
                current.wins_48k += 1
    return sorted(by_file.values(), key=lambda item: item.page), participants


def load_stimuli(path: Path) -> tuple[dict[int, tuple[str, str]], dict[str, str]]:
    content = json.loads(path.read_text(encoding="utf-8"))
    stimuli = content.get("stimuli")
    if not isinstance(stimuli, list):
        raise ValueError(f"{path} does not contain a stimuli list")
    mapping: dict[int, tuple[str, str]] = {}
    for page, pair in enumerate(stimuli):
        if not isinstance(pair, list) or len(pair) != 2:
            raise ValueError(f"{path}: page {page} must contain exactly two stimuli")
        paths = {rate_from_path(item): item for item in pair}
        if set(paths) != {"16k", "48k"}:
            raise ValueError(f"{path}: page {page} is not a 16k/48k pair")
        mapping[page] = (paths["16k"], paths["48k"])
    metadata = {
        "surveyGroup": str(content.get("survey_group", "")),
        "surveyName": str(content.get("survey_name", "")),
    }
    return mapping, metadata


def rate_from_path(path: str) -> str:
    for rate in ("16k", "48k"):
        if f"/{rate}/" in f"/{path}":
            return rate
    return "unknown"


def read_audio(path: Path) -> tuple[np.ndarray, int]:
    waveform, sample_rate = sf.read(path, always_2d=True, dtype="float32")
    if waveform.size == 0:
        raise ValueError(f"audio is empty: {path}")
    mono = waveform.mean(axis=1)
    mono = np.nan_to_num(mono, nan=0.0, posinf=0.0, neginf=0.0)
    return mono, sample_rate


def spectrogram_db(waveform: np.ndarray, sample_rate: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    segment = min(2048, max(256, 2 ** int(math.log2(max(256, len(waveform) // 80)))))
    frequencies, times, spectrum = stft(
        waveform,
        fs=sample_rate,
        window="hann",
        nperseg=segment,
        noverlap=segment * 3 // 4,
        boundary=None,
        padded=False,
    )
    magnitude = np.abs(spectrum)
    decibels = 20.0 * np.log10(np.maximum(magnitude, 1e-5))
    return frequencies, times, np.clip(decibels, -100.0, 0.0)


def write_spectrogram(audio_path: Path, output_path: Path) -> dict[str, object]:
    waveform, sample_rate = read_audio(audio_path)
    frequencies, times, decibels = spectrogram_db(waveform, sample_rate)
    figure, axis = plt.subplots(figsize=(8.2, 3.0), dpi=150)
    image = axis.pcolormesh(
        times,
        frequencies / 1000.0,
        decibels,
        shading="auto",
        cmap="magma",
        vmin=-100,
        vmax=0,
        rasterized=True,
    )
    axis.set_xlabel("Time (s)")
    axis.set_ylabel("Frequency (kHz)")
    axis.set_ylim(0, sample_rate / 2000.0)
    axis.grid(False)
    colorbar = figure.colorbar(image, ax=axis, pad=0.015)
    colorbar.set_label("Magnitude (dBFS)")
    figure.tight_layout()
    figure.savefig(output_path, bbox_inches="tight")
    plt.close(figure)
    return {
        "sampleRate": sample_rate,
        "duration": round(len(waveform) / sample_rate, 3),
        "peak": round(float(np.max(np.abs(waveform))), 6),
    }


def clean_generated_assets() -> None:
    patterns = (
        SITE_ROOT / "assets/audio/16k",
        SITE_ROOT / "assets/audio/48k",
        SITE_ROOT / "assets/spectrograms",
    )
    for directory in patterns:
        directory.mkdir(parents=True, exist_ok=True)
        for path in directory.iterdir():
            if path.is_file():
                path.unlink()


def build() -> None:
    args = parse_args()
    if args.top_k < 1:
        raise ValueError("--top-k must be at least 1")
    for path in (args.votes, args.survey, args.audio_root):
        if not path.exists():
            raise FileNotFoundError(path)

    series, participants = load_votes(args.votes)
    stimuli, survey_metadata = load_stimuli(args.survey)
    if not series:
        raise ValueError("no votes found")

    ranked = sorted(
        series,
        key=lambda item: (-item.rate_48k, -item.margin_48k, -item.wins_48k, item.page),
    )
    selected = ranked[: min(args.top_k, len(ranked))]
    clean_generated_assets()

    comparisons: list[dict[str, object]] = []
    for rank, stats in enumerate(selected, 1):
        if stats.page not in stimuli:
            raise ValueError(f"survey has no stimuli for page {stats.page}")
        relative_16k, relative_48k = stimuli[stats.page]
        source_16k = args.audio_root / relative_16k
        source_48k = args.audio_root / relative_48k
        if not source_16k.is_file() or not source_48k.is_file():
            raise FileNotFoundError(
                f"missing audio for {stats.fileid}: {source_16k} or {source_48k}"
            )

        audio_16k = SITE_ROOT / "assets/audio/16k" / stats.fileid
        audio_48k = SITE_ROOT / "assets/audio/48k" / stats.fileid
        spec_16k = SITE_ROOT / "assets/spectrograms" / f"{audio_16k.stem}_16k.png"
        spec_48k = SITE_ROOT / "assets/spectrograms" / f"{audio_48k.stem}_48k.png"
        shutil.copy2(source_16k, audio_16k)
        shutil.copy2(source_48k, audio_48k)
        info_16k = write_spectrogram(source_16k, spec_16k)
        info_48k = write_spectrogram(source_48k, spec_48k)

        comparison = stats.as_dict()
        comparison.update(
            {
                "rank": rank,
                "audio16k": audio_16k.relative_to(SITE_ROOT).as_posix(),
                "audio48k": audio_48k.relative_to(SITE_ROOT).as_posix(),
                "spectrogram16k": spec_16k.relative_to(SITE_ROOT).as_posix(),
                "spectrogram48k": spec_48k.relative_to(SITE_ROOT).as_posix(),
                "info16k": info_16k,
                "info48k": info_48k,
            }
        )
        comparisons.append(comparison)

    wins_16k = sum(item.wins_16k for item in series)
    wins_48k = sum(item.wins_48k for item in series)
    total_votes = wins_16k + wins_48k
    result = {
        "meta": {
            "surveyId": args.survey_id,
            **survey_metadata,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "participants": len(participants),
            "audioGroups": len(series),
        },
        "overall": {
            "totalVotes": total_votes,
            "wins16k": wins_16k,
            "wins48k": wins_48k,
            "rate16k": round(wins_16k / total_votes * 100, 1),
            "rate48k": round(wins_48k / total_votes * 100, 1),
        },
        "series": [item.as_dict() for item in series],
        "topComparisons": comparisons,
    }
    output = SITE_ROOT / "data/results.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"Built {output}: {len(participants)} participants, {total_votes} votes, "
        f"{len(comparisons)} comparisons"
    )


if __name__ == "__main__":
    build()
