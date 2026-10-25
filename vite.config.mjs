import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root=path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({root,publicDir:path.join(root,"public"),define:{"process.env.IS_PREACT":JSON.stringify(false)},build:{outDir:path.join(root,"dist"),emptyOutDir:true,assetsDir:"assets"}});
