// Read data literals only. Never evaluate scripts from the fetched YouTube page.
function quoted(text, start) {
  const quote = text[start];
  let value = "";
  for (let i = start + 1; i < text.length; i++) {
    const char = text[i];
    if (char === quote) return { value, end: i + 1 };
    if (char !== "\\") { value += char; continue; }
    const escape = text[++i];
    if (escape === "x" || escape === "u") {
      const size = escape === "x" ? 2 : 4;
      const hex = text.slice(i + 1, i + 1 + size);
      if (hex.length !== size || !/^[\da-f]+$/i.test(hex)) throw new Error("Invalid page escape");
      value += String.fromCharCode(parseInt(hex, 16)); i += size;
    } else if (escape === "\n") continue;
    else if (escape === "\r") { if (text[i + 1] === "\n") i++; }
    else if (escape === undefined) break;
    else value += ({ b: "\b", f: "\f", n: "\n", r: "\r", t: "\t", v: "\v", 0: "\0" })[escape] ?? escape;
  }
  throw new Error("Unterminated page string");
}

function objectArgument(html, start) {
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    if (html[i] === '"' || html[i] === "'") { i = quoted(html, i).end - 1; continue; }
    if (html[i] === "{") depth++;
    else if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error("Incomplete page object");
}

function dataObject(text) {
  // Normalize JS data syntax (single quotes, hex escapes, bare keys, trailing
  // commas) one token at a time so opaque challenge strings stay untouched.
  let json = "";
  for (let i = 0; i < text.length;) {
    const char = text[i];
    if (char === '"' || char === "'") {
      const string = quoted(text, i); json += JSON.stringify(string.value); i = string.end;
    } else if (char === "," && /^,\s*[}\]]/.test(text.slice(i, i + 100))) i++;
    else if (/[\s{}\[\],:]/.test(char)) { json += char; i++; }
    else {
      const token = text.slice(i).match(/^(?:[A-Za-z_$][\w$]*|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/)?.[0];
      if (!token) throw new Error("Unsupported page expression");
      const isKey = /^\s*:/.test(text.slice(i + token.length));
      if (!isKey && !/^(?:true|false|null|-?\d)/.test(token)) throw new Error("Unsupported page value");
      json += isKey ? JSON.stringify(token) : token; i += token.length;
    }
  }
  return JSON.parse(json);
}

export function extractPageAttestation(html) {
  if (typeof html !== "string" || html.length > 8000000) throw new Error("Invalid attestation page");
  let config = {};
  for (const match of html.matchAll(/\bytcfg\.set\(\s*(?=\{)/g)) {
    config = { ...config, ...dataObject(objectArgument(html, match.index + match[0].length)) };
  }
  const match = /\bwindow\.ytAtN\(\s*(?=\{)/.exec(html);
  if (!match || typeof config.EVENT_ID !== "string" || !config.EVENT_ID) throw new Error("Page attestation context unavailable");
  const envelope = dataObject(objectArgument(html, match.index + match[0].length));
  const response = typeof envelope.R === "string" ? JSON.parse(envelope.R) : envelope.R;
  const challenge = response?.bgChallenge;
  if (typeof challenge?.program !== "string" || !challenge.program || typeof challenge.globalName !== "string" ||
      typeof challenge.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue !== "string")
    throw new Error("Page challenge unavailable");
  return { config, challenge: { program: challenge.program, globalName: challenge.globalName,
    interpreterUrl: challenge.interpreterUrl } };
}
