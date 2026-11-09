import { DecodeError, decode } from "./net/decode";
import { PROTOCOL_VERSION, type ClientMessage } from "./net/protocol";
import { socketUrl } from "./net/socket";

function byId<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`The page has no #${id}`);
  }
  return found as T;
}

const status = byId<HTMLOutputElement>("status");
const log = byId<HTMLOListElement>("log");

const socket = new WebSocket(socketUrl(window.location));

socket.addEventListener("open", () => {
  status.textContent = "connected";
  const hello: ClientMessage = { type: "hello", protocol: PROTOCOL_VERSION, lang: "en" };
  socket.send(JSON.stringify(hello));
});

socket.addEventListener("close", (event) => {
  status.textContent = `closed (${event.code})`;
});

socket.addEventListener("message", (event) => {
  let type: string;
  try {
    const message = decode(String(event.data));
    type = message.type;
    if (message.type === "welcome") {
      localStorage.setItem("whist.token", message.token);
    } else if (message.type === "sync" && message.table === null) {
      status.textContent = "at no table";
    }
  } catch (error) {
    if (!(error instanceof DecodeError)) {
      throw error;
    }
    type = `unreadable (${error.field})`;
  }
  const item = document.createElement("li");
  item.textContent = type;
  log.append(item);
});
