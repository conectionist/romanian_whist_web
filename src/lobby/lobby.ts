import { t } from "../i18n/t";
import type { ClientMessage, Gender, Level, Presence, Settings, TableSeat, TableState } from "../net/protocol";
import { setSeat, updateSettings } from "../net/send";
import { roundCount } from "../sheets/rulesSheet";
import { MAX_SEATS, MIN_SEATS } from "./setup";

// An online table's lobby: who sits where, and what its host may change between games. The model is
// a pure function of the table's state, as the sheets' are of the store.

export interface LobbySeat {
  index: number;
  kind: "open" | "human" | "computer";
  name: string;
  gender: Gender | null;
  avatar: string;
  level: Level | null;
  presence: Presence | null;
  you: boolean;
  host: boolean;
}

export interface LobbyView {
  code: string;
  seats: LobbySeat[];
  // Your seat, or null when you have none.
  youSeat: number | null;
  isHost: boolean;
  open: number;
  // Only the host starts, and only once every seat holds a person or a computer player.
  canStart: boolean;
  settings: Settings;
}

function seatOf(seat: TableSeat, index: number, host: number | null): LobbySeat {
  if (seat.kind === "open") {
    return { index, kind: "open", name: "", gender: null, avatar: "", level: null, presence: null, you: false, host: false };
  }
  return {
    index,
    kind: seat.kind,
    name: seat.name,
    gender: seat.gender,
    avatar: seat.avatar,
    level: seat.kind === "computer" ? seat.level : null,
    presence: seat.kind === "human" ? seat.presence : null,
    you: seat.kind === "human" && seat.you,
    host: host === index,
  };
}

export function youSeatOf(table: Pick<TableState, "seats">): number | null {
  const at = table.seats.findIndex((seat) => seat.kind === "human" && seat.you);
  return at < 0 ? null : at;
}

export function lobbyFor(table: TableState): LobbyView {
  const seats = table.seats.map((seat, index) => seatOf(seat, index, table.host));
  const youSeat = youSeatOf(table);
  const open = seats.filter((seat) => seat.kind === "open").length;
  const isHost = youSeat !== null && table.host === youSeat;
  return { code: table.code, seats, youSeat, isHost, open, canStart: isHost && open === 0, settings: table.settings };
}

// "1-8-1 · 26 rounds · 60 s a turn": what the table is set up to deal and how long a turn may take.
export function summaryOf(settings: Settings): string {
  const rounds = roundCount({ seats: settings.seats.length, foreheadAndHidden: settings.foreheadAndHidden });
  const timer = settings.turnTimer ?? 60000;
  const pace = timer === 0 ? t("lobby", "no turn timer") : t("lobby", "%1 s a turn", [timer / 1000]);
  return `${settings.structure} · ${t("newgame", "%n rounds", [], { n: rounds })} · ${pace}`;
}

// What the host's choice for a seat sends: open, or a computer player of that level.
export function seatChoice(seat: number, choice: "open" | Level): ClientMessage {
  return choice === "open" ? setSeat(seat, "open") : setSeat(seat, "computer", choice);
}

// One message for each open seat, each making a computer player of this level: the offer to fill the
// table with them, so the game can start with fewer people than seats.
export function fillMessages(view: LobbyView, level: Level): ClientMessage[] {
  return view.seats.filter((seat) => seat.kind === "open").map((seat) => setSeat(seat.index, "computer", level));
}

// The table's settings with a change: whole, as the server takes them. Only the number of seats is
// read of settings.seats: seats added are open, and seats taken off the end must hold nobody.
export function settingsChange(table: TableState, change: Partial<Settings>): ClientMessage {
  return updateSettings({ ...table.settings, ...change });
}

// What a seat-count field holds, or null when it holds no whole number: an emptied field is not a
// request for the fewest seats.
export function seatCountFrom(text: string): number | null {
  const count = Number(text.trim());
  return text.trim() === "" || !Number.isInteger(count) ? null : count;
}

export function withSeatCount(table: TableState, count: number): ClientMessage {
  const seats = Math.min(Math.max(Math.trunc(count), MIN_SEATS), MAX_SEATS);
  const next = table.settings.seats.slice(0, seats);
  while (next.length < seats) {
    next.push({ kind: "open" });
  }
  return updateSettings({ ...table.settings, seats: next });
}

// The fewest seats the table can be cut to: the last seat that is held, and two.
export function fewestSeats(view: LobbyView): number {
  let last = -1;
  view.seats.forEach((seat) => {
    if (seat.kind !== "open") {
      last = seat.index;
    }
  });
  return Math.max(MIN_SEATS, last + 1);
}

export function presenceText(presence: Presence | null): string {
  switch (presence) {
    case "away":
      return t("online", "Away");
    case "replaced":
      return t("online", "Replaced");
    default:
      return "";
  }
}
