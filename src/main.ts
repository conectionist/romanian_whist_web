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
  socket.send(JSON.stringify({ type: "hello", protocol: 1, lang: "en" }));
});

socket.addEventListener("close", (event) => {
  status.textContent = `closed (${event.code})`;
});

socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data)) as { type: string; token?: string; table?: unknown };
  if (message.type === "welcome" && message.token !== undefined) {
    localStorage.setItem("whist.token", message.token);
  }
  if (message.type === "sync" && message.table === null) {
    status.textContent = "at no table";
  }
  const item = document.createElement("li");
  item.textContent = message.type;
  log.append(item);
});
