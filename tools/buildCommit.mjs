// The commit a build is of, for About and the footer's link to the source. Shared by the build and the tests that
// say what it should have been.

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

// The commit as the build writes it: what it was told, else the checkout's head, with "-dirty" after it when the
// tree has changes, else nothing. A repository that holds this folder without being it says nothing of what is in it.
export function chooseCommit({ told, toplevel, folder, head, porcelain }) {
  if (told !== undefined && told.trim() !== "") {
    return told.trim();
  }
  if (toplevel === undefined || head === undefined || toplevel !== folder || head === "") {
    return "";
  }
  return porcelain === undefined || porcelain.trim() === "" ? head : `${head}-dirty`;
}

function runGit(folder, args) {
  return execFileSync("git", args, { cwd: folder, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

export function buildCommit(folder, env = process.env, git = runGit) {
  const told = env.WHIST_WEB_COMMIT;
  if (told !== undefined && told.trim() !== "") {
    return told.trim();
  }
  try {
    return chooseCommit({
      toplevel: realpathSync(git(folder, ["rev-parse", "--show-toplevel"])),
      folder: realpathSync(folder),
      head: git(folder, ["rev-parse", "HEAD"]),
      // Without the optional locks, so that a build never takes the index's lock from a git that is running.
      porcelain: git(folder, ["--no-optional-locks", "status", "--porcelain"]),
    });
  } catch {
    return "";
  }
}

// Run as a command, it prints the commit for the folder it is run in, for the image's build argument.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(buildCommit(process.cwd()));
}
