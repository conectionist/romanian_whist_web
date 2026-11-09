# Romanian Whist in the browser

The browser page for Romanian Whist: solo games against computer players, and online tables. Every
game is played on [the Romanian Whist server](https://github.com/conectionist/romanian_whist_server),
which is a submodule here, in `libs/romanian_whist_server`.

**Status:** a page that says hello to the server's WebSocket at `/ws` and shows what the server answers. [`docs/page-plan.md`](docs/page-plan.md) is the plan for the rest.

## Getting the code

```
git clone --recurse-submodules https://github.com/conectionist/romanian_whist_web.git
```

The submodule is needed to run the page against a server, and by the unit tests, which read the
server's protocol fixtures. Cloned without `--recurse-submodules`? The unit tests need
`git submodule update --init libs/romanian_whist_server`; running the page against a server needs
`git submodule update --init --recursive`.

## Building the page

Node 22.12 or later:

```
npm ci
npm run build
```

## Running it

Build the server in the submodule first, as its README says. Its first build compiles Drogon too
and takes several minutes:

```
cd libs/romanian_whist_server
cmake --preset default
nice -n 19 cmake --build --preset default -j 2
```

Then, from this repository's root, after `npm run build`:

```
libs/romanian_whist_server/build/server/app/whist_server --config server.json
```

and open http://127.0.0.1:8080. `server.json` points the server at `dist/`.

While working on the page, `npm run dev` serves it on port 5173 and passes `/ws` through to the
server on port 8080.

## Tests

```
nice -n 19 npx vitest run --maxWorkers=2    # the unit tests
nice -n 19 npm run e2e -- --workers=1       # the page against the server, in Chromium
```

The end-to-end tests start the server built in the submodule, or the one `WHIST_SERVER` names.
They need Playwright's Chromium once: `npx playwright install chromium`.

## Licence

AGPL-3.0-or-later, as the server and the engine are.
