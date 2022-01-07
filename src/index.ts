import "./polyfill.ts";
import { Buffer } from "https://deno.land/std@0.120.0/node/buffer.ts";
import { serve } from "https://deno.land/std@0.120.0/http/server.ts";
import { ReplayParser } from "https://esm.sh/@voces/w3gjs?pin=v61";

const fmtTime = (milliseconds: number) => {
  let s = "";
  let force = false;
  if (milliseconds > 3600000) {
    const hours = Math.floor(milliseconds / 3600000);
    s += hours + ":";
    milliseconds -= hours * 3600000;
    force = true;
  }
  if (milliseconds > 60000 || force) {
    const minutes = Math.floor(milliseconds / 60000);
    s += minutes.toString().padStart(force ? 2 : 0, "0") + ":";
    milliseconds -= minutes * 60000;
    force = true;
  }
  if (milliseconds > 1000 || force) {
    const seconds = Math.floor(milliseconds / 1000);
    s += seconds.toString().padStart(force ? 2 : 0, "0") + ".";
    milliseconds -= seconds * 1000;
    force = true;
  } else s = "0.";
  s += milliseconds.toString().padEnd(3, "0");
  return s;
};

const header = `<!-- Append /json to view easily consumable output. -->
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
pre {
    margin: 0.25em 0px;
    white-space: pre-wrap;
    word-break: break-word;
}
.time { color: #aaa; }
.error { color: #f33; }
.error::before { content: '🚫 '; }
.warning { color: #cc3; }
.warning::before { content: '⚠️ '; }
@media (prefers-color-scheme: dark) {
    body {
        background-color: #151522;
        color: white;
    }
    a { color: #55f; }
    a:visited { color: #9c4ce6; }
}
</style>\n`;

const _endpoint = async (
  replayId: number,
  isJSON: boolean,
  writer: WritableStreamDefaultWriter,
) => {
  const encoder = new TextEncoder();
  const write = (data: string) => writer.write(encoder.encode(data));

  if (!isJSON) writer.write(encoder.encode(header));

  const url = "https://api.wc3stats.com/replays/" + replayId;
  if (!isJSON) {
    write(
      `<pre>replay: <a href="https://wc3stats.com/games/${replayId}/mmd">https://wc3stats.com/games/${replayId}/mmd</a></pre>
<pre>url: <a href=${url}>${url}</a></pre>\n`,
    );
  }

  const data = await fetch(url)
    .then((r) => r.json())
    .catch((err) => err);

  if (data instanceof Error) throw data;

  if (data.code >= 400) {
    if (isJSON) write(JSON.stringify(data));
    else write(`<pre class="error">${JSON.stringify(data)}</pre>`);
    writer.close();
    return;
  }

  const replayFile = `https://api.wc3stats.com/replays/${replayId}/download`;

  if (!isJSON) {
    write(
      `<pre>name: ${data.body.name}</pre>
<pre>map: ${data.body.data.game.map}</pre>
<pre>file: <a href=${replayFile}>${replayFile}</a></pre>\n`,
    );
  } else {
    write("[");
  }

  const buffer = Buffer.from(
    await (await fetch(replayFile)).arrayBuffer(),
  );
  const parser = new ReplayParser();

  let gameTime = 0;
  let first = true;
  const players: { name: string; time: number }[] = [];
  let versionKnown = false;
  const variables: Record<
    string,
    { name: string; type: string; time: number }
  > = {};
  const events: Record<
    string,
    {
      name: string;
      args: { name: string; prefix?: string }[];
      format: string;
      time: number;
    }
  > = {};
  parser.on(
    "gamedatablock",
    (gamedatablock) => {
      if (gamedatablock.id !== 0x1f && gamedatablock.id !== 0x1e) return;
      if (typeof gamedatablock.timeIncrement === "number") {
        gameTime += gamedatablock.timeIncrement;
      }
      if (gamedatablock.commandBlocks) {
        for (const commandBlock of gamedatablock.commandBlocks) {
          for (const action of commandBlock.actions) {
            if (
              action.id === 107 &&
              action.filename.toLowerCase().includes("mmd") &&
              action.missionKey.startsWith("val:")
            ) {
              let error;
              let warning;
              const parts = action.key.split(/(?<!\\)\s/);
              if (action.key.length >= 255) {
                warning =
                  `max length ${action.key.length} reached, data will be truncated and possibly mutated`;
              }
              try {
                switch (parts[0]) {
                  case "init":
                    switch (parts[1]) {
                      case "version":
                        if (parts.length !== 4) {
                          error =
                            `expected four parts for init version, received ${parts.length}`;
                        }
                        if (
                          isNaN(parseInt(parts[2])) ||
                          isNaN(parseInt(parts[3]))
                        ) {
                          error = `expected numbers for parts 3 and 4`;
                        }
                        if (versionKnown) {
                          error = `init version sent multiple times`;
                        }
                        versionKnown = true;
                        break;
                      case "pid":
                        if (parts.length !== 4) {
                          error =
                            `expected four parts for init pid, received ${parts.length}`;
                        }
                        if (isNaN(parseInt(parts[2]))) {
                          error = `expected number for part 3`;
                        }
                        if (players[parseInt(parts[2])]) {
                          error = `init pid sent multiple times for player ${
                            parts[2]
                          } (${parts[3]})`;
                        }
                        if (isNaN(parseInt(parts[2]))) {
                          error = "expected part 3 to be number";
                        }
                        players[parseInt(parts[2])] = {
                          name: parts[3],
                          time: gameTime,
                        };
                        break;
                      default:
                        error = `unknown emission: ${action.key}`;
                    }
                    break;
                  case "DefVarP":
                    if (parts.length !== 5) {
                      error =
                        `expected five parts for DefVarP, received ${parts.length}`;
                    }
                    if (
                      parts[2] !== "real" &&
                      parts[2] !== "int" &&
                      parts[2] !== "string"
                    ) {
                      error =
                        `expected part 3 (type) to be real, int, or string`;
                    }
                    if (
                      parts[3] !== "high" &&
                      parts[3] !== "low" &&
                      parts[3] !== "none"
                    ) {
                      error = `expected part 4 (goal) to be high, low, or none`;
                    }
                    if (
                      parts[4] !== "none" &&
                      parts[4] !== "track" &&
                      parts[4] !== "leaderboard"
                    ) {
                      error =
                        `expected part 5 (suggestion) to be none, track, or leaderboard`;
                    }
                    if (variables[parts[1]]) {
                      error = `variable ${parts[1]} defined multiple times`;
                    }
                    variables[parts[1]] = {
                      name: parts[1],
                      type: parts[2],
                      time: gameTime,
                    };
                    break;
                  case "VarP": {
                    if (parts.length !== 5) {
                      error =
                        `expected five parts for VarP, received ${parts.length}`;
                    }
                    if (!players[parseInt(parts[1])]) {
                      error = `expected init pid ${
                        parts[1]
                      } to be called before using in VarP`;
                    } else if (
                      gameTime <
                        players[parseInt(parts[1])].time + 1000
                    ) {
                      warning =
                        `ordering isn't deterministic, so players should be defined at least a few seconds before emitting values`;
                    }
                    const variable = variables[parts[2]];
                    if (!variable) {
                      warning = `expected DefVarP ${
                        parts[2]
                      } to be called before using in VarP`;
                    } else {
                      if (variable.type === "string") {
                        if (parts[3] !== "=") {
                          error = `expected part 4 to be = for string`;
                        }
                      } else {
                        if (
                          parts[3] !== "=" &&
                          parts[3] !== "+=" &&
                          parts[3] !== "-="
                        ) {
                          error = `expected part 4 to be =, +=, or -=`;
                        }
                      }
                      if (gameTime < variable.time + 1000) {
                        warning =
                          `ordering isn't deterministic, so variables should be defined at least a few seconds before emitting values`;
                      }
                    }
                    break;
                  }
                  case "FlagP":
                    if (parts.length !== 3) {
                      error =
                        `expected three parts for FlagP, received ${parts.length}`;
                    }
                    if (!players[parseInt(parts[1])]) {
                      error = `expected init pid ${
                        parts[1]
                      } to be called before using in FlagP`;
                    } else if (
                      gameTime <
                        players[parseInt(parts[1])].time + 1000
                    ) {
                      warning =
                        `ordering isn't deterministic, so players should be defined at least a few seconds before emitting flags`;
                    }
                    if (
                      parts[2] !== "winner" &&
                      parts[2] !== "loser" &&
                      parts[2] !== "drawer" &&
                      parts[2] !== "leaver" &&
                      parts[2] !== "practicing"
                    ) {
                      error =
                        `expected part 3 to be winner, loser, drawer, leaver, or practicing`;
                    }
                    break;
                  case "DefEvent": {
                    if (parts.length < 4) {
                      error =
                        `expected at least four parts for DefEvent, received ${parts.length}`;
                    }
                    if (events[parts[1]]) {
                      error = `event ${parts[1]} defined multiple times`;
                    }
                    const argCount = parseInt(parts[2]);
                    const args = [];
                    if (isNaN(argCount)) {
                      error = `expected part 3 to be a number`;
                    } else {
                      if (argCount + 4 !== parts.length) {
                        error = `expected ${argCount + 4} (4+${
                          parseInt(
                            parts[2],
                          )
                        }) parts, received ${parts.length}`;
                      }
                      for (let i = 3; i < 3 + argCount; i++) {
                        const argParts = parts[i].split(":");
                        if (argParts.length === 1) {
                          args.push({ name: parts[i] });
                        } else {
                          args.push({
                            name: argParts[1],
                            prefix: argParts[0],
                          });
                        }
                      }
                      const placeholders = (
                        parts[parts.length - 1].match(/{.*?}/g) || []
                      )
                        .map((v) => v.slice(1, -1).split(":"))
                        .map((args) =>
                          args.length === 1
                            ? { index: parseInt(args[0]) }
                            : { index: parseInt(args[0]), suffix: args[1] }
                        );
                      for (const placeholder of placeholders) {
                        if (placeholder.index >= argCount) {
                          error =
                            `referenced variable index ${placeholder.index} is greater than the defined number of variables ${
                              parseInt(parts[2])
                            }`;
                        }
                        if (
                          placeholder.suffix === "player" &&
                          args[placeholder.index].prefix !== "pid"
                        ) {
                          error = `expected arg ${
                            args[placeholder.index].name
                          } to be defined with pid: prefix if formatting with :player suffix`;
                        }
                      }
                    }
                    events[parts[1]] = {
                      name: parts[1],
                      args,
                      format: parts[parts.length - 1],
                      time: gameTime,
                    };
                    break;
                  }
                  case "Event": {
                    if (parts.length < 2) {
                      error =
                        `expected at least two parts for Event, received ${parts.length}`;
                    }
                    const event = events[parts[1]];
                    if (!event) {
                      error = `expected DefEvent ${
                        parts[1]
                      } to be called before using in Event`;
                    } else {
                      if (parts.length !== event.args.length + 2) {
                        error = `expected ${
                          event.args.length +
                          2
                        } (2+${event.args.length}) parts, received ${parts.length}`;
                      }
                      if (gameTime < event.time + 1000) {
                        warning =
                          `ordering isn't deterministic, so events should be defined at least a few seconds before emitting events`;
                      }
                    }
                    break;
                  }
                  case "Blank":
                    if (parts.length !== 1) {
                      error =
                        `expected one part for Blank, received ${parts.length}`;
                    }
                    break;
                  case "Custom":
                    if (parts.length < 2) {
                      error =
                        `expected at least two parts for Custom, received ${parts.length}`;
                    }
                    break;
                  default:
                    error = `unknown emission: ${action.key}`;
                }
              } catch {
                /* do nothing*/
              }
              if (isJSON) {
                write(`${first ? "" : ","}{"time":${
                  gameTime /
                  1000
                },"event":${JSON.stringify(parts)}${
                  error ? `,"error":${JSON.stringify(error)}` : ""
                }}${warning ? `,"warning":${JSON.stringify(warning)}` : ""}`);
              } else {
                write(`<pre><span class="time">[${
                  fmtTime(
                    gameTime,
                  )
                }]</span> <span title="${
                  action.key.replace(
                    /"/g,
                    "&quot;",
                  )
                }">${action.key.replace(/\\ /g, " ")}</span>${
                  error
                    ? ` <span class="error">${error}</span>`
                    : warning
                    ? ` <span class="warning">${warning}</span>`
                    : ""
                }</pre>\n`);
              }
              first = false;
            }
          }
        }
      }
    },
  );

  // Actually start parsing
  await parser.parse(buffer);

  if (isJSON) write("]");

  writer.close();
};

const endpoint = (request: Request) => {
  // Figure out path/request
  const { pathname } = new URL(request.url);
  const parts = pathname.split("/");
  const replayId = parseInt(parts[1]);
  const isJSON = parts[2] === "json";

  try {
    // Validate we have a replay
    if (isNaN(replayId)) {
      return new Response(
        isJSON
          ? JSON.stringify({ error: "no replayid passed" })
          : '<pre class="error">no replay passed</pre>',
        {
          status: 400,
          headers: {
            "Content-Type": isJSON
              ? "application/json"
              : "text/html; charset=UTF-8",
          },
        },
      );
    }

    const { writable, readable } = new TransformStream();
    const writer = writable.getWriter();
    const res = new Response(readable, {
      headers: {
        "Content-Type": isJSON
          ? "application/json"
          : "text/html; charset=UTF-8",
      },
    });

    _endpoint(replayId, isJSON, writer);

    // Immediately respond with a 200; we'll stream the results
    return res;
  } catch (err) {
    console.log(err);
    return new Response(isJSON ? JSON.stringify(err.message) : err.toString());
  }
};

serve(endpoint);
