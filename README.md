# the forgerdr · website

This orphan branch holds the website of [the forgerdr](https://github.com/Gn0m0-dei/the-forgerdr): the landing page and the documentation, published at <https://gn0m0-dei.github.io/the-forgerdr/>.

It lives apart from `main` on purpose: the plugin installs `main` as a whole, so the site's images and video stay out of every installed copy.

## Working on it

Branch from `origin/site` and open the pull request against `site`. When a change on `main` alters behaviour, the page that documents it changes here too.

```bash
pnpm install
pnpm dev     # local preview
pnpm build   # astro check, then the static site in dist/
pnpm test    # the helpers' specs, then checks over the built site
```

The screens in `public/screens` are the herdr app itself, shot on a demo forge of this repository, and the walkthrough in `public/media` is rendered from them. When the app's look changes, both are made again and committed together.

The GitHub Actions workflow builds every pull request against `site` and deploys every push to it.

Pages must publish from GitHub Actions, and the `github-pages` environment's deployment branch policy must name `site`: GitHub creates that environment allowing only the default branch, so until `site` is added the deploy job is refused.

## License

MIT.
