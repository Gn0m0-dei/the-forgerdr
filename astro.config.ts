import starlight from "@astrojs/starlight";
import { defineConfig, fontProviders } from "astro/config";
import starlightImageZoom from "starlight-image-zoom";
import { SITE } from "#config/site.ts";

export default defineConfig({
  base: SITE.base,
  fonts: [
    {
      cssVariable: "--font-mono",
      fallbacks: ["ui-monospace", "monospace"],
      name: "JetBrains Mono",
      provider: fontProviders.google(),
      weights: [400, 700],
    },
  ],
  integrations: [
    starlight({
      components: {
        Head: "./src/components/starlight/Head.astro",
        ThemeProvider: "./src/components/starlight/ThemeProvider.astro",
        ThemeSelect: "./src/components/starlight/ThemeSelect.astro",
      },
      customCss: ["./src/styles/tokens.css", "./src/styles/starlight.css"],
      description: SITE.description,
      editLink: { baseUrl: `${SITE.repository}/edit/site/` },
      plugins: [starlightImageZoom()],
      sidebar: [{ label: "Overview", slug: "docs" }],
      social: [{ href: SITE.repository, icon: "github", label: "GitHub" }],
      title: SITE.title,
    }),
  ],
  site: SITE.origin,
});
