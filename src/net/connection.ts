import { DecodeError, decode } from "./decode";
import { PROTOCOL_VERSION, type ClientMessage, type ServerMessage } from "./protocol";

export type Status = "connecting" | "open" | "closed" | "elsewhere";

// How long to wait before each new attempt after a connection is lost, in milliseconds: 1, 2, 4,
// 8 and then 15 seconds for as long as it takes.
export const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];

export function delayFor(attempt: number): number {
  return BACKOFF_MS[Math.min(Math.max(attempt, 0), BACKOFF_MS.length - 1)];
}

export const TOKEN_KEY = "whist.token";
const RELOADED_KEY = "whist.reloaded";

type Memory = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface ConnectionOptions {
  url: string;
  onMessage(message: ServerMessage): void;
  onStatus(status: Status): void;
  // A message the page cannot read: reported, and the connection goes on.
  onUnreadable?(error: DecodeError): void;
  // Where the member's token is kept; the browser's local storage by default.
  storage?: Memory;
  // Where the page notes that it has reloaded for a new version, so it reloads once and no more.
  session?: Memory;
  createSocket?(url: string): WebSocket;
  setTimer?(run: () => void, ms: number): number;
  clearTimer?(id: number): void;
  reload?(): void;
}

function browserStorage(read: () => Storage): Memory {
  // Wrapped on every use: storage can be refused, or come back empty, in a private window or with
  // site data blocked.
  return {
    getItem: (key) => {
      try {
        return read().getItem(key);
      } catch {
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        read().setItem(key, value);
      } catch {
        // The member lasts until the page is closed.
      }
    },
    removeItem: (key) => {
      try {
        read().removeItem(key);
      } catch {
        // Nothing to remove.
      }
    },
  };
}

// The page's one WebSocket: it says hello, keeps the token the server gives back, and reconnects
// with a back-off when the connection is lost. It does not reconnect after the server says another
// tab has taken the member over, or the two tabs would take it from each other for ever.
export class Connection {
  private socket: WebSocket | null = null;
  private attempt = 0;
  private timer: number | null = null;
  private stopped = false;
  // Whether this socket has been welcomed: a refused token is only the page's to drop before then.
  private welcomed = false;
  // Whether the token has been dropped since the last welcome: a refusal after that is not for the
  // page to answer at once, or a token that cannot be removed would be sent again with no pause.
  private droppedToken = false;
  private readonly storage: Memory;
  private readonly session: Memory;

  constructor(private readonly options: ConnectionOptions) {
    this.storage = options.storage ?? browserStorage(() => window.localStorage);
    this.session = options.session ?? browserStorage(() => window.sessionStorage);
  }

  start(): void {
    this.stopped = false;
    this.open();
  }

  private open(): void {
    this.timer = null;
    this.options.onStatus("connecting");
    this.welcomed = false;
    const socket = (this.options.createSocket ?? ((url) => new WebSocket(url)))(this.options.url);
    this.socket = socket;

    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }
      this.options.onStatus("open");
      const token = this.storage.getItem(TOKEN_KEY);
      const hello: ClientMessage = {
        type: "hello",
        protocol: PROTOCOL_VERSION,
        lang: "en",
        ...(token === null || token === "" ? {} : { token }),
      };
      socket.send(JSON.stringify(hello));
    });

    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) {
        return;
      }
      this.receive(String(event.data));
    });

    socket.addEventListener("close", () => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      if (this.stopped) {
        return;
      }
      this.options.onStatus("closed");
      const wait = delayFor(this.attempt);
      this.attempt += 1;
      this.timer = (this.options.setTimer ?? ((run, ms) => window.setTimeout(run, ms)))(() => this.open(), wait);
    });
  }

  private receive(text: string): void {
    let message: ServerMessage;
    try {
      message = decode(text);
    } catch (error) {
      if (error instanceof DecodeError) {
        this.options.onUnreadable?.(error);
        return;
      }
      throw error;
    }

    if (message.type === "welcome") {
      this.welcomed = true;
      this.droppedToken = false;
      this.storage.setItem(TOKEN_KEY, message.token);
      this.attempt = 0;
      this.session.removeItem(RELOADED_KEY);
    } else if (message.type === "error" && message.code === "openElsewhere") {
      this.stopped = true;
      this.options.onStatus("elsewhere");
    } else if (message.type === "error" && message.code === "badMessage" && message.detail === "token" && !this.welcomed) {
      // The stored token is not one the server reads, so no welcome will come: ask again without it.
      this.restartWithoutToken();
    } else if (message.type === "error" && message.code === "version") {
      // This page is of another version than the server: load the current one, once.
      this.stopped = true;
      this.options.onStatus("closed");
      if (this.session.getItem(RELOADED_KEY) === null) {
        this.session.setItem(RELOADED_KEY, "1");
        (this.options.reload ?? (() => window.location.reload()))();
      }
    }
    this.options.onMessage(message);
  }

  private restartWithoutToken(): void {
    const refused = this.socket;
    if (this.droppedToken) {
      // Closed, and the connection is tried again after the back-off like any lost one.
      refused?.close();
      return;
    }
    this.droppedToken = true;
    this.storage.removeItem(TOKEN_KEY);
    this.socket = null;
    refused?.close();
    this.open();
  }

  // Sends a message if the connection is open; says whether it did.
  send(message: ClientMessage): boolean {
    if (this.socket === null || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  close(): void {
    this.stopped = true;
    if (this.timer !== null) {
      (this.options.clearTimer ?? ((id) => window.clearTimeout(id)))(this.timer);
      this.timer = null;
    }
    this.socket?.close();
  }
}
