import argparse
import re
from pathlib import Path

from reconcile_srt_ollama import read_srt


def stamp(seconds):
    millis = max(0, int(round(seconds * 1000)))
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def normalized(text):
    return re.sub(r"[\s.,!?ฯๆ]+", "", text or "").lower()


def sanitize(cues, preserve_duration=False):
    ordered = sorted((dict(x) for x in cues if x["text"].strip()), key=lambda x: (x["start"], x["end"]))
    deduped = []
    for cue in ordered:
        if deduped and cue["start"] <= deduped[-1]["start"] + 0.06:
            before, current = normalized(deduped[-1]["text"]), normalized(cue["text"])
            if before and current and (before in current or current in before):
                if len(current) >= len(before):
                    deduped[-1] = cue
                continue
        deduped.append(cue)

    result = []
    for index, cue in enumerate(deduped):
        start, end = cue["start"], cue["end"]
        if not preserve_duration:
            chars = len(re.sub(r"\s+", "", cue["text"]))
            readable_max = min(2.8, max(0.9, 0.60 + chars / 8.0))
            end = min(end, start + readable_max)
        if index + 1 < len(deduped):
            next_start = deduped[index + 1]["start"]
            if end > next_start:
                end = next_start - 0.04
        if end >= start + 0.12:
            cue["start"], cue["end"] = start, end
            result.append(cue)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("output")
    parser.add_argument(
        "--preserve-duration",
        action="store_true",
        help="Keep ASR cue durations and only remove duplicates/overlaps.",
    )
    args = parser.parse_args()
    cues = sanitize(read_srt(args.source), preserve_duration=args.preserve_duration)
    body = "\n\n".join(
        f"{index}\n{stamp(x['start'])} --> {stamp(x['end'])}\n{x['text']}"
        for index, x in enumerate(cues, 1)
    ) + "\n"
    Path(args.output).write_text(body, encoding="utf-8")
    print(f"sanitized={len(cues)}", flush=True)


if __name__ == "__main__":
    main()
