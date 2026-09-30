import { StandardAudioPlayer } from "./StandardAudioPlayer";

export async function setupPlayer(): Promise<void> {
  await StandardAudioPlayer.setupPlayer();
}
