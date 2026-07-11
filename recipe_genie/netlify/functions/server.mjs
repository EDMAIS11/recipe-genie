// Netlify Function que serve o SSR do TanStack Start.
//
// O build gera um handler universal em dist/server/server.js que exporta
// `default { fetch(request, env, ctx) }`. Esta função carrega-o e reencaminha
// todos os pedidos. Sem ela, o Netlify só servia dist/client (estático) e as
// páginas davam 404.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// A função é empacotada em netlify/functions/ e o dist/server é incluído via
// "included_files" no netlify.toml, mantendo a estrutura relativa do projeto.
const serverModule = await import(join(here, "../../dist/server/server.js"));
const serverEntry = serverModule.default ?? serverModule;

export default async function handler(request, context) {
  return serverEntry.fetch(request, context, context);
}

export const config = {
  path: "/*",
  preferStatic: true,
};

// Force Netlify function rebuild: 2026-07-11
