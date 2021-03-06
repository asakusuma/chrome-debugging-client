import { AttachMessageTransport } from "@tracerbench/message-transport";
import _newProtocolConnection, {
  RootConnection,
} from "@tracerbench/protocol-connection";
import _spawn, {
  Process,
  ProcessWithPipeMessageTransport,
  Stdio,
} from "@tracerbench/spawn";
import _spawnChrome, { Chrome, SpawnOptions } from "@tracerbench/spawn-chrome";
import openWebSocket from "@tracerbench/websocket-message-transport";
import debug = require("debug");
import { EventEmitter } from "events";
import { combineRaceCancellation, RaceCancellation } from "race-cancellation";

const debugCallback = debug("chrome-debugging-client");

export * from "@tracerbench/message-transport";
export * from "@tracerbench/protocol-connection/types";
export * from "@tracerbench/spawn/types";
export * from "@tracerbench/spawn-chrome/types";

export function spawnChrome(
  options?: Partial<SpawnOptions>,
): ChromeWithPipeConnection {
  return attachPipeTransport(_spawnChrome(options));
}

export function spawnWithPipe(
  executable: string,
  args: string[],
  stdio?: Stdio,
): ProcessWithPipeConnection {
  return attachPipeTransport(_spawn(executable, args, stdio, "pipe"));
}

export async function spawnWithWebSocket(
  executable: string,
  args: string[],
  stdio?: Stdio,
  raceCancellation?: RaceCancellation,
): Promise<ProcessWithWebSocketConnection> {
  const process = _spawn(executable, args, stdio, "websocket");
  const url = await process.url(raceCancellation);
  const [attach, close] = await openWebSocket(
    url,
    combineRaceCancellation(process.raceExit, raceCancellation),
  );
  const connection = newProtocolConnection(attach);
  return Object.assign(process, { connection, close });
}

export function newProtocolConnection(attach: AttachMessageTransport) {
  return _newProtocolConnection(
    attach,
    () => new EventEmitter(),
    debugCallback,
  );
}

export {
  default as openWebSocket,
} from "@tracerbench/websocket-message-transport";

export { default as findChrome } from "@tracerbench/find-chrome";

function attachPipeTransport<P extends ProcessWithPipeMessageTransport>(
  process: P,
): P & {
  connection: RootConnection;
  close(timeout?: number, raceCancellation?: RaceCancellation): Promise<void>;
} {
  const connection = newProtocolConnection(process.attach);
  return Object.assign(process, { close, connection });

  async function close(timeout?: number, raceCancellation?: RaceCancellation) {
    if (process.hasExited()) {
      return;
    }
    try {
      const waitForExit = process.waitForExit(timeout, raceCancellation);
      await Promise.race([waitForExit, connection.send("Browser.close")]);
      // double check in case send() won the race which is most of the time
      // sometimes chrome exits before send() gets a response
      await waitForExit;
    } catch (e) {
      // if we closed then we dont really care what the error is
      if (!process.hasExited()) {
        throw e;
      }
    }
  }
}

export interface ChromeWithPipeConnection extends Chrome {
  /**
   * Connection to devtools protocol https://chromedevtools.github.io/devtools-protocol/
   */
  connection: RootConnection;

  /**
   * Close browser.
   */
  close(timeout?: number, raceCancellation?: RaceCancellation): Promise<void>;
}

export interface ProcessWithPipeConnection extends Process {
  /**
   * Connection to devtools protocol https://chromedevtools.github.io/devtools-protocol/
   */
  connection: RootConnection;

  /**
   * Close browser.
   */
  close(timeout?: number, raceCancellation?: RaceCancellation): Promise<void>;
}

export interface ProcessWithWebSocketConnection extends Process {
  /**
   * Connection to devtools protocol https://chromedevtools.github.io/devtools-protocol/
   */
  connection: RootConnection;

  /**
   * Closes the web socket.
   */
  close(): void;
}
