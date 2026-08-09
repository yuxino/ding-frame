export interface TranscriptLine {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

export interface TranscriptGroup {
  minute: number;
  startMs: number;
  endMs: number;
  lines: Array<TranscriptLine & { index: number }>;
  speakers: Set<string>;
  text: string;
  speakerLabel: string;
}

const MINUTE_MS = 60_000;

export function groupTranscriptByMinute(transcript: TranscriptLine[] = [], durationMs = 0): TranscriptGroup[] {
  const groups = new Map<number, Omit<TranscriptGroup, "text" | "speakerLabel">>();

  for (const [index, line] of transcript.entries()) {
    const startMs = Math.max(0, Number(line?.startMs) || 0);
    const minute = Math.floor(startMs / MINUTE_MS);
    const existing = groups.get(minute) || {
      minute,
      startMs: minute * MINUTE_MS,
      endMs: Math.min(durationMs || (minute + 1) * MINUTE_MS, (minute + 1) * MINUTE_MS),
      lines: [],
      speakers: new Set<string>()
    };

    const text = typeof line?.text === "string" ? line.text.trim() : "";
    if (text) existing.lines.push({ ...line, text, index });
    if (line?.speaker !== undefined && line?.speaker !== null && String(line.speaker).trim()) {
      existing.speakers.add(String(line.speaker).trim());
    }
    groups.set(minute, existing);
  }

  return [...groups.values()]
    .filter((group) => group.lines.length)
    .sort((a, b) => a.minute - b.minute)
    .map((group) => ({
      ...group,
      text: group.lines.map((line) => line.text).join(" "),
      speakerLabel: group.speakers.size === 1
        ? `说话人 ${[...group.speakers][0]}`
        : group.speakers.size > 1
          ? `${group.speakers.size} 位说话人`
          : "人声"
    }));
}
