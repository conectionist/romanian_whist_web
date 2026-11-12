import type { ClientMessage, Level, Profile, Settings } from "./protocol";

// The messages a person's choices become, each built in one place so the fields it carries are the
// ones PROTOCOL.md lists for it.

// The profile's three fields: a form's record may hold more.
function profileOf(profile: Profile): Profile {
  return { name: profile.name, gender: profile.gender, avatar: profile.avatar };
}

export function createTable(settings: Settings, profile: Profile): ClientMessage {
  return { type: "createTable", settings, profile: profileOf(profile) };
}

export function joinTable(code: string, profile: Profile): ClientMessage {
  return { type: "joinTable", code, profile: profileOf(profile) };
}


export function takeSeat(seat: number): ClientMessage {
  return { type: "takeSeat", seat };
}

// A seat the host makes open, or a computer player of that level.
export function setSeat(seat: number, kind: "open"): ClientMessage;
export function setSeat(seat: number, kind: "computer", level: Level): ClientMessage;
export function setSeat(seat: number, kind: "open" | "computer", level?: Level): ClientMessage {
  if (kind === "open") {
    return { type: "setSeat", seat, kind };
  }
  if (level === undefined) {
    throw new Error("A computer player needs a level");
  }
  return { type: "setSeat", seat, kind, level };
}

export function updateSettings(settings: Settings): ClientMessage {
  return { type: "updateSettings", settings };
}

export function continueRound(round: number): ClientMessage {
  return { type: "continue", round };
}
