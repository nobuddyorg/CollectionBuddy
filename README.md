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
[![CodeQL](https://img.shields.io/badge/security-CodeQL-blue?logo=github)](https://github.com/nobuddyorg/CollectionBuddy/security/code-scanning)
[![Last commit](https://img.shields.io/github/last-commit/nobuddyorg/CollectionBuddy)](https://github.com/nobuddyorg/CollectionBuddy/commits/main)
[![License: MIT](https://img.shields.io/github/license/nobuddyorg/CollectionBuddy)](LICENSE)

## Motivation

This project was created to provide a simple and elegant solution for cataloging personal collections. Whether it's stamps, coins, or any other collectible, CollectionBuddy helps you keep track of your items in an organized manner.

## Usage

### Development

CollectionBuddy needs a Supabase backend to run -- see
[CONTRIBUTING.md](CONTRIBUTING.md) for the full local setup, including
starting the local Supabase stack in [`supabase/`](supabase/) and the
Google OAuth credentials it needs. The short version, once that's done:

1. Navigate to the `web` directory:

    ```bash
    cd web
    ```

2. Copy the environment template and fill in `NEXT_PUBLIC_SUPABASE_URL` /
    `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the defaults in `web/.env.example`
    match a local `supabase start`):

    ```bash
    cp .env.example .env.local
    ```

3. Install the dependencies:

    ```bash
    npm install
    ```

4. Start the development server:

    ```bash
    npm run dev
    ```

    The application will be available at `http://localhost:3000`.

### Building for Production

To build the application for production, run the `build.sh` script from the root directory:

```bash
./build.sh
```

**Note:** A production build requires the `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` environment variables to be set. These can be obtained from your Supabase project dashboard.

The static files will be generated locally, ready for deployment. The script demonstrates how it's done, but real deployment should happen in your pipeline.

## Documentation

Full docs live in [`docs/`](docs/README.md), organised by [Diátaxis](https://diataxis.fr):

- **Tutorial** — [Getting started](docs/tutorials/getting-started.md)
- **How-to** — [User guide](docs/how-to/user-guide.md) · [Developer guide](docs/how-to/developer-guide.md) (checks, migrations, new environments, deploy)
- **Reference** — [Architecture](docs/reference/architecture.md) · [Configuration](docs/reference/configuration.md)
- **Explanation** — [Design decisions](docs/explanation/design-decisions.md)

## Technology Stack

### Frontend

- **[Next.js](https://nextjs.org/)**: A React framework, used here in **static export mode** (`output: 'export'`) -- there is no server runtime or route handlers, and Server Components only ever render at build time, before any user session exists. See [CONTRIBUTING.md](CONTRIBUTING.md) for what that means for contributors.
- **[React](https://reactjs.org/)**: A JavaScript library for building user interfaces.
- **[TypeScript](https://www.typescriptlang.org/)**: A typed superset of JavaScript that compiles to plain JavaScript.
- **[Tailwind CSS](https://tailwindcss.com/)**: A utility-first CSS framework for rapidly building custom designs.

### Backend

- **[Supabase](https://supabase.io/)**: An open-source Firebase alternative that provides a suite of tools for building applications, including:
  - **Authentication**: For managing user sign-ups and logins.
  - **PostgreSQL Database**: For storing application data.
  - **Storage**: For managing user-uploaded files, such as images of collected items.

### Deployment

The application is built as a static site and can be deployed on any static hosting service, such as GitHub Pages, Vercel, or Netlify. The `build.sh` script prepares the application for deployment.

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

Contributions are welcome! Whether it's a bug fix, new feature, or just improving the docs—open an issue or submit a pull request.

Before contributing, please check out [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and the checks CI runs.

## License

This project is licensed under the MIT License.
