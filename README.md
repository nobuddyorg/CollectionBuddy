# CollectionBuddy

A web-app catalog for your collected items 🗂️

![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?logo=nodedotjs&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![Supabase](https://img.shields.io/badge/backend-Supabase-3ECF8E?logo=supabase&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/hosting-GitHub%20Pages-blue?logo=github)
![ESLint](https://img.shields.io/badge/ESLint-9-4B32C3?logo=eslint)
![Prettier](https://img.shields.io/badge/Prettier-3-F7B93E?logo=prettier)
![SonarJS](https://img.shields.io/badge/code%20smells-SonarJS-4E9BCD?logo=sonar&logoColor=white)
![dependency-cruiser](https://img.shields.io/badge/architecture-dependency--cruiser-orange)
![Knip](https://img.shields.io/badge/dead%20code-Knip-000000?logo=knip&logoColor=white)
![SQLFluff](https://img.shields.io/badge/SQL%20lint-SQLFluff-0074D9)
![Accessibility](https://img.shields.io/badge/a11y-jsx--a11y%20%2B%20axe--core-663399?logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48IS0tISBGb250IEF3ZXNvbWUgRnJlZSA2LjcuMiBieSBAZm9udGF3ZXNvbWUgLSBodHRwczovL2ZvbnRhd2Vzb21lLmNvbSBMaWNlbnNlIC0gaHR0cHM6Ly9mb250YXdlc29tZS5jb20vbGljZW5zZS9mcmVlIChJY29uczogQ0MgQlkgNC4wLCBGb250czogU0lMIE9GTCAxLjEsIENvZGU6IE1JVCBMaWNlbnNlKSBDb3B5cmlnaHQgMjAyNCBGb250aWNvbnMsIEluYy4gLS0%2BPHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTAgMjU2YTI1NiAyNTYgMCAxIDEgNTEyIDBBMjU2IDI1NiAwIDEgMSAwIDI1NnptMTYxLjUtODYuMWMtMTIuMi01LjItMjYuMyAuNC0zMS41IDEyLjZzLjQgMjYuMyAxMi42IDMxLjVsMTEuOSA1LjFjMTcuMyA3LjQgMzUuMiAxMi45IDUzLjYgMTYuM2wwIDUwLjFjMCA0LjMtLjcgOC42LTIuMSAxMi42bC0yOC43IDg2LjFjLTQuMiAxMi42IDIuNiAyNi4yIDE1LjIgMzAuNHMyNi4yLTIuNiAzMC40LTE1LjJsMjQuNC03My4yYzEuMy0zLjggNC44LTYuNCA4LjgtNi40czcuNiAyLjYgOC44IDYuNGwyNC40IDczLjJjNC4yIDEyLjYgMTcuOCAxOS40IDMwLjQgMTUuMnMxOS40LTE3LjggMTUuMi0zMC40bC0yOC43LTg2LjFjLTEuNC00LjEtMi4xLTguMy0yLjEtMTIuNmwwLTUwLjFjMTguNC0zLjUgMzYuMy04LjkgNTMuNi0xNi4zbDExLjktNS4xYzEyLjItNS4yIDE3LjgtMTkuMyAxMi42LTMxLjVzLTE5LjMtMTcuOC0zMS41LTEyLjZMMzM4LjcgMTc1Yy0yNi4xIDExLjItNTQuMiAxNy04Mi43IDE3cy01Ni41LTUuOC04Mi43LTE3bC0xMS45LTUuMXpNMjU2IDE2MGE0MCA0MCAwIDEgMCAwLTgwIDQwIDQwIDAgMSAwIDAgODB6Ii8%2BPC9zdmc%2B)
![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest)
![Playwright](https://img.shields.io/badge/e2e-Playwright-2EAD33?logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjQwMCIgdmlld0JveD0iMCAwIDQwMCA0MDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI%2BPHBhdGggZD0iTTEzNi40IDIyMS42QzEyMy42IDIyNS4yIDExNS4xIDIzMS42IDEwOS41IDIzOEMxMTQuOSAyMzMuNCAxMjIgMjI5LjEgMTMxLjcgMjI2LjNDMTQxLjUgMjIzLjYgMTQ5LjkgMjIzLjYgMTU2LjkgMjI0LjlWMjE5LjVDMTUwLjkgMjE4LjkgMTQ0LjEgMjE5LjQgMTM2LjQgMjIxLjZaTTEwOC45IDE3NS45TDYxLjEgMTg4LjVDNjEuMSAxODguNSA2MiAxODkuNyA2My42IDE5MS40TDEwNC4yIDE4MC43QzEwNC4yIDE4MC43IDEwMy42IDE4OC4xIDk4LjYgMTk0LjdDMTA4IDE4Ny42IDEwOC45IDE3NS45IDEwOC45IDE3NS45Wk0xNDkgMjg4LjNDODEuNyAzMDYuNSA0NiAyMjguNCAzNS4yIDE4Ny45QzMwLjMgMTY5LjIgMjguMSAxNTUuMSAyNy41IDE0NS45QzI3LjQgMTQ1IDI3LjUgMTQ0LjIgMjcuNSAxNDMuNEMyNCAxNDMuNyAyMi40IDE0NS41IDIyLjcgMTUwLjdDMjMuMyAxNTkuOSAyNS41IDE3NCAzMC40IDE5Mi43QzQxLjIgMjMzLjIgNzYuOSAzMTEuMyAxNDQuMiAyOTMuMUMxNTguOSAyODkuMiAxNjkuOSAyODIgMTc4LjIgMjcyLjhDMTcwLjUgMjc5LjcgMTYxIDI4NS4xIDE0OSAyODguM1pNMTYxLjcgMTI4LjFWMTMyLjlIMTg4LjFDMTg3LjUgMTMxLjIgMTg3IDEyOS43IDE4Ni40IDEyOC4xSDE2MS43WiIgZmlsbD0iI2ZmZmZmZiIvPjxwYXRoIGQ9Ik0xOTQgMTY3LjZDMjA1LjkgMTcxIDIxMi4xIDE3OS4zIDIxNS41IDE4Ni43TDIyOC43IDE5MC40QzIyOC43IDE5MC40IDIyNi45IDE2NC42IDIwMy42IDE1OEMxODEuNyAxNTEuOCAxNjguMyAxNzAuMSAxNjYuNyAxNzIuNUMxNzMgMTY4IDE4Mi4zIDE2NC4zIDE5NCAxNjcuNlpNMjk5LjQgMTg2LjhDMjc3LjYgMTgwLjUgMjY0LjEgMTk4LjkgMjYyLjUgMjAxLjNDMjY4LjkgMTk2LjcgMjc4LjIgMTkzIDI4OS44IDE5Ni40QzMwMS43IDE5OS43IDMwOCAyMDguMSAzMTEuMyAyMTUuNEwzMjQuNiAyMTkuMkMzMjQuNiAyMTkuMiAzMjIuNyAxOTMuNCAyOTkuNCAxODYuOFpNMjg2LjMgMjU0LjhMMTc2LjEgMjI0QzE3Ni4xIDIyNCAxNzcuMyAyMzAgMTgxLjggMjM3LjlMMjc0LjYgMjYzLjhDMjgyLjMgMjU5LjQgMjg2LjMgMjU0LjggMjg2LjMgMjU0LjhaTTIwOS45IDMyMS4xQzEyMi42IDI5Ny43IDEzMy4yIDE4Ni41IDE0Ny4zIDEzMy45QzE1My4xIDExMi4yIDE1OS4xIDk2IDE2NCA4NS4yQzE2MS4xIDg0LjYgMTU4LjYgODYuMiAxNTYuMiA5MS4xQzE1MC45IDEwMS43IDE0NC4yIDExOS4xIDEzNy43IDE0My40QzEyMy42IDE5Ni4xIDExMyAzMDcuMyAyMDAuMyAzMzAuN0MyNDEuNCAzNDEuNyAyNzMuNCAzMjUgMjk3LjMgMjk4LjdDMjc0LjcgMzE5LjIgMjQ1LjcgMzMwLjcgMjA5LjkgMzIxLjFaIiBmaWxsPSIjZmZmZmZmIi8%2BPHBhdGggZD0iTTE2MS43IDI2Mi4zVjIzOS45TDk5LjMgMjU3LjVDOTkuMyAyNTcuNSAxMDMuOSAyMzAuOCAxMzYuNCAyMjEuNkMxNDYuMyAyMTguOCAxNTQuNyAyMTguOCAxNjEuNyAyMjAuMVYxMjguMUgxOTIuOUMxODkuNSAxMTcuNiAxODYuMiAxMDkuNSAxODMuNCAxMDMuOUMxNzguOSA5NC42IDE3NC4yIDEwMC44IDE2My41IDEwOS43QzE1Ni4xIDExNS45IDEzNy4xIDEyOS4zIDEwOC43IDEzNi45QzgwLjIgMTQ0LjYgNTcuMiAxNDIuNiA0Ny42IDE0MC45QzM0IDEzOC42IDI2LjggMTM1LjYgMjcuNSAxNDUuOUMyOC4xIDE1NS4xIDMwLjMgMTY5LjIgMzUuMiAxODcuOUM0NiAyMjguNCA4MS43IDMwNi41IDE0OSAyODguM0MxNjYuNiAyODMuNiAxNzkgMjc0LjIgMTg3LjYgMjYyLjNIMTYxLjdWMjYyLjNaTTYxLjEgMTg4LjVMMTA4LjkgMTc1LjlDMTA4LjkgMTc1LjkgMTA3LjYgMTk0LjMgODkuNiAxOTlDNzEuNyAyMDMuNyA2MS4xIDE4OC41IDYxLjEgMTg4LjVaIiBmaWxsPSIjZmZmZmZmIi8%2BPHBhdGggZD0iTTM0MS44IDEyOS4yQzMyOS4zIDEzMS40IDI5OS41IDEzNC4xIDI2Mi42IDEyNC4yQzIyNS43IDExNC4zIDIwMS4yIDk3IDE5MS41IDg4LjlDMTc3LjggNzcuNCAxNzEuNyA2OS40IDE2NS44IDgxLjVDMTYwLjUgOTIuMiAxNTMuOCAxMDkuNSAxNDcuMyAxMzMuOUMxMzMuMiAxODYuNSAxMjIuNiAyOTcuNyAyMDkuOSAzMjEuMUMyOTcuMSAzNDQuNSAzNDMuNSAyNDIuOSAzNTcuNiAxOTAuMkMzNjQuMiAxNjUuOSAzNjcgMTQ3LjUgMzY3LjggMTM1LjZDMzY4LjcgMTIyLjIgMzU5LjUgMTI2LjEgMzQxLjggMTI5LjJaTTE2Ni41IDE3Mi44QzE2Ni41IDE3Mi44IDE4MC4yIDE1MS40IDIwMy42IDE1OEMyMjYuOSAxNjQuNiAyMjguNyAxOTAuNCAyMjguNyAxOTAuNEwxNjYuNSAxNzIuOFpNMjIzLjQgMjY4LjdDMTgyLjQgMjU2LjcgMTc2LjEgMjI0IDE3Ni4xIDIyNEwyODYuMyAyNTQuOEMyODYuMyAyNTQuOCAyNjQgMjgwLjYgMjIzLjQgMjY4LjdaTTI2Mi40IDIwMS41QzI2Mi40IDIwMS41IDI3Ni4xIDE4MC4xIDI5OS40IDE4Ni44QzMyMi43IDE5My40IDMyNC42IDIxOS4yIDMyNC42IDIxOS4yTDI2Mi40IDIwMS41WiIgZmlsbD0iI2ZmZmZmZiIvPjxwYXRoIGQ9Ik0xMzkuOSAyNDZMOTkuMyAyNTcuNUM5OS4zIDI1Ny41IDEwMy43IDIzMi40IDEzMy42IDIyMi41TDExMC42IDEzNi4zTDEwOC43IDEzNi45QzgwLjIgMTQ0LjYgNTcuMiAxNDIuNiA0Ny42IDE0MC45QzM0IDEzOC42IDI2LjggMTM1LjYgMjcuNSAxNDUuOUMyOC4xIDE1NS4xIDMwLjMgMTY5LjIgMzUuMiAxODcuOUM0NiAyMjguNCA4MS43IDMwNi41IDE0OSAyODguM0wxNTEgMjg3LjdMMTM5LjkgMjQ2Wk02MS4xIDE4OC41TDEwOC45IDE3NS45QzEwOC45IDE3NS45IDEwNy42IDE5NC4zIDg5LjYgMTk5QzcxLjcgMjAzLjcgNjEuMSAxODguNSA2MS4xIDE4OC41WiIgZmlsbD0iI2ZmZmZmZiIvPjxwYXRoIGQ9Ik0yMjUuMyAyNjkuMkwyMjMuNCAyNjguN0MxODIuNCAyNTYuNyAxNzYuMSAyMjQgMTc2LjEgMjI0TDIzMi45IDIzOS45TDI2MyAxMjQuM0wyNjIuNiAxMjQuMkMyMjUuNyAxMTQuMyAyMDEuMiA5NyAxOTEuNSA4OC45QzE3Ny44IDc3LjQgMTcxLjcgNjkuNCAxNjUuOCA4MS41QzE2MC41IDkyLjIgMTUzLjggMTA5LjUgMTQ3LjMgMTMzLjlDMTMzLjIgMTg2LjUgMTIyLjYgMjk3LjcgMjA5LjkgMzIxLjFMMjExLjcgMzIxLjVMMjI1LjMgMjY5LjJaTTE2Ni41IDE3Mi44QzE2Ni41IDE3Mi44IDE4MC4yIDE1MS40IDIwMy42IDE1OEMyMjYuOSAxNjQuNiAyMjguNyAxOTAuNCAyMjguNyAxOTAuNEwxNjYuNSAxNzIuOFoiIGZpbGw9IiNmZmZmZmYiLz48cGF0aCBkPSJNMTQxLjkgMjQ1LjVMMTMxLjEgMjQ4LjVDMTMzLjYgMjYzIDEzOC4yIDI3Ni45IDE0NS4zIDI4OS4yQzE0Ni41IDI4OC45IDE0Ny43IDI4OC43IDE0OSAyODguM0MxNTIuMyAyODcuNSAxNTUuNCAyODYuMyAxNTguMyAyODUuMUMxNTAuNCAyNzMuNCAxNDUuMSAyNTkuOCAxNDEuOSAyNDUuNVpNMTM3LjcgMTQzLjVDMTMyLjEgMTY0LjMgMTI3LjEgMTk0LjMgMTI4LjUgMjI0LjRDMTMxIDIyMy40IDEzMy42IDIyMi40IDEzNi40IDIyMS42TDEzOC41IDIyMS4xQzEzNiAxODguOSAxNDEuMyAxNTYuMiAxNDcuMyAxMzMuOUMxNDguOCAxMjguMiAxNTAuMyAxMjMgMTUxLjggMTE4LjFDMTQ5LjQgMTE5LjYgMTQ2LjggMTIxLjIgMTQzLjggMTIyLjlDMTQxLjggMTI5LjEgMTM5LjcgMTM1LjkgMTM3LjcgMTQzLjVaIiBmaWxsPSIjZmZmZmZmIi8%2BPC9zdmc%2B)
![pgTAP](https://img.shields.io/badge/DB%20tests-pgTAP-336791?logo=postgresql&logoColor=white)
[![Mutation testing badge](https://img.shields.io/endpoint?style=plastic&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fnobuddyorg%2FCollectionBuddy%2Fmain)](https://dashboard.stryker-mutator.io/reports/github.com/nobuddyorg/CollectionBuddy/main)
[![CI](https://github.com/nobuddyorg/CollectionBuddy/actions/workflows/ci.yml/badge.svg)](https://github.com/nobuddyorg/CollectionBuddy/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/nobuddyorg/CollectionBuddy/graph/badge.svg)](https://codecov.io/gh/nobuddyorg/CollectionBuddy)
[![CodeQL](https://img.shields.io/badge/security-CodeQL-blue?logo=github)](https://github.com/nobuddyorg/CollectionBuddy/security/code-scanning)
[![Opengrep](https://img.shields.io/badge/SAST-Opengrep-blue?logo=github)](https://github.com/nobuddyorg/CollectionBuddy/security/code-scanning)
![Lighthouse CI](https://img.shields.io/badge/performance-Lighthouse%20CI-F44B21?logo=lighthouse&logoColor=white)
![OWASP ZAP](https://img.shields.io/badge/DAST-OWASP%20ZAP-FFC933?logo=owasp&logoColor=white)
[![Last commit](https://img.shields.io/github/last-commit/nobuddyorg/CollectionBuddy)](https://github.com/nobuddyorg/CollectionBuddy/commits/main)
[![License: MIT](https://img.shields.io/github/license/nobuddyorg/CollectionBuddy)](LICENSE)

## Motivation

Spreadsheets don't have room for a photograph, and social apps don't care about provenance. CollectionBuddy is neither: a quiet, photo-first catalog for the things you collect, whether that's coins, stamps, records, or cameras. Every entry leads with a picture, carries a place and a few tags, and stays searchable once the shelf outgrows memory.

| Sign in                                                                                                                            | Your collection                                                                                                                              | Every item on a map                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ![Google sign-in screen for CollectionBuddy, showing the app name and tagline inside a circular seal motif](docs/assets/login.png) | ![A Pokémon collection grid in CollectionBuddy, each entry showing a photo, title, description, place, and tags](docs/assets/collection.png) | ![A world map with pins marking the places a collection's items are from](docs/assets/map.png) |

## Features

- **Photo-first entries**: one photo, a pair, or a whole strip. Phone photos are compressed to WebP in the browser before upload, so there's no manual resizing.
- **Categories** to keep collections apart, with **sharing** so someone else can browse yours — read-only by default, or with edit access if you grant it.
- **Place and map**: give an item a location, then see your whole collection pinned on a map.
- **Tags and search** across title, description, place, and tags at once.
- **Import/export** a category as a portable archive.
- **Bilingual, themeable**: German/English and light/dark/system, both remembered per visitor.
- Built to work with a keyboard and a screen reader, not just a mouse.
- **Local demo mode**: run a local Supabase stack in Docker and try the app with no Google account or sign-in screen — see [CONTRIBUTING.md](CONTRIBUTING.md#try-the-local-demo).

See the [user guide](docs/how-to/user-guide.md) for the full rundown.

## Documentation

Full docs live in [`docs/`](docs/README.md), organised by [Diátaxis](https://diataxis.fr):

- **Tutorial**: [Getting started](docs/tutorials/getting-started.md)
- **How-to**: [User guide](docs/how-to/user-guide.md) · [Developer guide](docs/how-to/developer-guide.md) (checks, migrations, new environments, deploy)
- **Reference**: [Architecture](docs/reference/architecture.md) · [Configuration](docs/reference/configuration.md)
- **Explanation**: [Design decisions](docs/explanation/design-decisions.md)

## Technology Map

<p align="center">
  <img src="https://api.iconify.design/logos:nodejs-icon.svg?height=88" height="88" alt="Node.js" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:typescript-icon.svg?height=88" height="88" alt="TypeScript" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:react.svg?height=82" height="82" alt="React" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:nextjs-icon.svg?height=82" height="82" alt="Next.js" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:tailwindcss-icon.svg?height=82" height="82" alt="Tailwind CSS" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:supabase-icon.svg?height=82" height="82" alt="Supabase" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:postgresql.svg?height=82" height="82" alt="PostgreSQL" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:leaflet.svg?height=66" height="66" alt="Leaflet" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:docker-icon.svg?height=72" height="72" alt="Docker" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:github-icon.svg?height=82" height="82" alt="GitHub Pages" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:github-actions.svg?height=82" height="82" alt="GitHub Actions" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/vscode-icons:file-type-codeql.svg?height=78" height="78" alt="CodeQL" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:vitest.svg?height=82" height="82" alt="Vitest" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:playwright.svg?height=82" height="82" alt="Playwright" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/simple-icons:stryker.svg?height=82&color=%23E74C3C" height="82" alt="Stryker" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:lighthouse.svg?height=82" height="82" alt="Lighthouse" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:eslint.svg?height=82" height="82" alt="ESLint" />
  &nbsp;&nbsp;&nbsp;
  <img src="https://api.iconify.design/logos:prettier.svg?height=72" height="72" alt="Prettier" />
</p>

## Contributing

Contributions are welcome. Whether it's a bug fix, a new feature, or just improving the docs, open an issue or submit a pull request.

Before contributing, please check out [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and the checks CI runs.

## License

This project is licensed under the MIT License.
