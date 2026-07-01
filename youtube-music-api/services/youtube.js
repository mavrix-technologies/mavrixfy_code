import { Innertube, Platform } from "youtubei.js";

import vm from "node:vm";

let youtubePromise = null;
let evaluatorInstalled = false;

function installJavascriptEvaluator() {
  if (evaluatorInstalled) return;

  Platform.shim.eval = async (data, env) => {
    const source = String(data?.output || "");
    const script = new vm.Script(`(function(){\n${source}\n})()`);
    const context = vm.createContext({
      env,
      URL,
      URLSearchParams,
      TextDecoder,
      TextEncoder,
      atob: globalThis.atob,
      btoa: globalThis.btoa,
    });
    return script.runInContext(context);
  };

  evaluatorInstalled = true;
}

export async function getYoutube() {
  if (!youtubePromise) {
    installJavascriptEvaluator();

    youtubePromise = Innertube.create({
      lang: process.env.YOUTUBE_MUSIC_LANGUAGE || "en",
      location: process.env.YOUTUBE_MUSIC_LOCATION || "IN",
      retrieve_player: true,
      cookie: process.env.YOUTUBE_COOKIE || undefined,
      po_token: process.env.YOUTUBE_PO_TOKEN || undefined,
    });
  }

  return youtubePromise;
}
