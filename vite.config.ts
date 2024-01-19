import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { CssModuleTypes } from "./watching-css-modules";
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), CssModuleTypes()],
});
