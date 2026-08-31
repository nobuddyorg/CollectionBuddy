# CollectionBuddy

A web-app catalog for your collected items 🗂️

![Node.js](https://img.shields.io/badge/node-%3E%3D22-brightgreen?logo=node.js)
![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Supabase](https://img.shields.io/badge/backend-Supabase-3ECF8E?logo=supabase&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/hosting-GitHub%20Pages-blue?logo=github)
![ESLint](https://img.shields.io/badge/ESLint-9-4B32C3?logo=eslint)
![Prettier](https://img.shields.io/badge/Prettier-3-F7B93E?logo=prettier)
![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest)
[![Mutation testing badge](https://img.shields.io/endpoint?style=plastic&url=https%3A%2F%2Fbadge-api.stryker-mutator.io%2Fgithub.com%2Fnobuddyorg%2FCollectionBuddy%2Fmain)](https://dashboard.stryker-mutator.io/reports/github.com/nobuddyorg/CollectionBuddy/main)
[![CI](https://github.com/nobuddyorg/CollectionBuddy/actions/workflows/ci.yml/badge.svg)](https://github.com/nobuddyorg/CollectionBuddy/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/nobuddyorg/CollectionBuddy/graph/badge.svg)](https://codecov.io/gh/nobuddyorg/CollectionBuddy)
[![CodeQL](https://img.shields.io/badge/security-CodeQL-blue?logo=github)](https://github.com/nobuddyorg/CollectionBuddy/security/code-scanning)
[![Last commit](https://img.shields.io/github/last-commit/nobuddyorg/CollectionBuddy)](https://github.com/nobuddyorg/CollectionBuddy/commits/main)
[![License: MIT](https://img.shields.io/github/license/nobuddyorg/CollectionBuddy)](LICENSE)

## Motivation

Spreadsheets don't have room for a photograph, and social apps don't care about provenance. CollectionBuddy is neither: a quiet, photo-first catalog for the things you collect, whether that's coins, stamps, records, or cameras. Every entry leads with a picture, carries a place and a few tags, and stays searchable once the shelf outgrows memory.

| Sign in                                                                                                                            | Your collection                                                                                                                              | Every item on a map                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| ![Google sign-in screen for CollectionBuddy, showing the app name and tagline inside a circular seal motif](docs/assets/login.png) | ![A Pokémon collection grid in CollectionBuddy, each entry showing a photo, title, description, place, and tags](docs/assets/collection.png) | ![A world map with pins marking the places a collection's items are from](docs/assets/map.png) |

## Features

- **Photo-first entries**: one photo, a pair, or a whole strip. Phone photos are compressed to WebP in the browser before upload, so there's no manual resizing.
- **Categories** to keep collections apart, with **sharing** so someone else can browse (read-only) yours.
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
  <img src="https://api.iconify.design/simple-icons:stryker.svg?height=82&color=%23E74C3C" height="82" alt="Stryker" />
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
