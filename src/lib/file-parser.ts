import type { FileParseResult, ParsedSong } from "@/types/import";
import { toDurationSeconds } from "@/utils/timeFormatters";

/** Quoted delimiters, escaped quotes and multiline fields stay in their record. */
function csvRecords(content: string, separator: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      if (quoted && content[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && (char === separator || char === "\n" || char === "\r")) {
      row.push(cell.trim()); cell = "";
      if (char !== separator) {
        if (row.some(Boolean)) records.push(row);
        row = [];
        if (char === "\r" && content[i + 1] === "\n") i++;
      }
    } else cell += char;
  }
  if (quoted) throw new Error("A quoted field is not closed.");
  row.push(cell.trim());
  if (row.some(Boolean)) records.push(row);
  return records;
}

function csvSeparator(content: string): string {
  const counts = new Map([[",", 0], ["\t", 0], [";", 0]]);
  let quoted = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      if (quoted && content[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted) {
      if (char === "\n" || char === "\r") break;
      if (counts.has(char)) counts.set(char, counts.get(char)! + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}

function parseCSV(content: string): FileParseResult {
  const records = csvRecords(content, csvSeparator(content)), songs: ParsedSong[] = [], errors: string[] = [];
  const headers = (records[0] || []).map(value => value.toLowerCase().replace(/\(s\)/g, "s").replace(/[^a-z0-9]+/g, " ").trim());
  const titleIndex = headers.findIndex(value => ["track name", "song name", "title", "song", "name"].includes(value));
  const artistIndex = headers.findIndex(value => ["artist", "artist name", "artist names", "artists", "singer"].includes(value));
  const albumIndex = headers.findIndex(value => ["album", "album name"].includes(value));
  const durationIndex = headers.findIndex(value => /^(duration|length)( |$)/.test(value));
  const hasHeaders = titleIndex >= 0;
  for (let index = hasHeaders ? 1 : 0; index < records.length; index++) {
    const cells = records[index];
    const title = cells[hasHeaders ? titleIndex : 0]?.trim() || "";
    const artist = cells[hasHeaders ? artistIndex : 1]?.trim() || "";
    if (!title) { errors.push("Row " + (index + 1) + ": Missing title"); continue; }
    const rawDuration = cells[hasHeaders ? durationIndex : 2] || "";
    const duration = hasHeaders && durationIndex >= 0 && /\b(ms|milliseconds)\b/.test(headers[durationIndex])
      ? Math.max(0, Number(rawDuration) || 0) / 1000 : toDurationSeconds(rawDuration);
    songs.push({ title, artist, album: hasHeaders && albumIndex >= 0 ? cells[albumIndex] || "" : "",
      duration, status: "ready" });
  }
  return { songs, errors, totalLines: records.length };
}

function parseTXT(content: string): FileParseResult {
  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const songs = lines.map((line): ParsedSong => {
    const separator = line.includes("\t") ? "\t" : line.includes(" by ") ? " by " : line.includes(" - ") ? " - " : line.includes(",") ? "," : "";
    if (!separator) return { title: line, artist: "", status: "ready" };
    const index = line.indexOf(separator), left = line.slice(0, index).trim(), right = line.slice(index + separator.length).trim();
    return { title: separator === " - " ? right : left, artist: separator === " - " ? left : right, status: "ready" };
  });
  return { songs: songs.filter(song => song.title), errors: [], totalLines: lines.length };
}

export function parseFile(content: string, fileName: string): FileParseResult {
  const text = content.replace(/^\uFEFF/, "").trim();
  if (!text) return { songs: [], errors: ["File is empty"], totalLines: 0 };
  const extension = fileName.toLowerCase().split(".").pop();
  try {
    if (extension === "csv") return parseCSV(text);
    if (extension === "txt") return parseTXT(text);
    return { songs: [], errors: ["Please choose a CSV or TXT file."], totalLines: 0 };
  } catch (error) {
    return { songs: [], errors: [error instanceof Error ? error.message : "Could not read file."], totalLines: 0 };
  }
}
