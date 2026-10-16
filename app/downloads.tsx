import { DownloadedSongsScreen } from "@/features/downloads/screens/DownloadedSongsScreen";
import { ScreenWithNavigation } from "@/features/navigation/ScreenWithNavigation";

export default function DownloadsRoute() {
  return <ScreenWithNavigation><DownloadedSongsScreen /></ScreenWithNavigation>;
}
