import { type Song } from "@/lib/musicData";

function searchYouTubeMusicVideos(
  _query: string,
  _limit?: number,
  _signal?: AbortSignal
): Promise<Song[]> {
  return Promise.resolve([]);
}

export async function getYouTubeMusicVisualVideoId(song: Song): Promise<string | null> {
  if (!song) return null;
  if (song.youtubeVisualVideoId && song.youtubeVisualVideoId.length === 11) {
    return song.youtubeVisualVideoId;
  }
  if (song.youtubeVideoId && song.youtubeVideoId.length === 11) {
    return song.youtubeVideoId;
  }

  const query = `${song.title || ""} ${song.artist || ""} official lyrical video`.trim();
  if (!query) return null;

  try {
    const res = await fetch("https://www.youtube.com/youtubei/v1/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: "WEB",
            clientVersion: "2.20240101.01.00",
            hl: "en",
            gl: "IN",
          },
        },
        query,
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    const contents =
      json?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents || [];

    for (const item of contents) {
      const vid = item?.videoRenderer?.videoId;
      if (vid && typeof vid === "string" && vid.length === 11) {
        return vid;
      }
    }
  } catch {
    // Ignore error
  }
  return null;
}
