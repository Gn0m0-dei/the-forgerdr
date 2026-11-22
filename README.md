# the forgerdr · website

This orphan branch holds the website of [the forgerdr](https://github.com/Gn0m0-dei/the-forgerdr): the landing page and the documentation, published at <https://gn0m0-dei.github.io/the-forgerdr/>.

It lives apart from `main` on purpose: the plugin installs `main` as a whole, so the site's images and video stay out of every installed copy.

## Working on it

Branch from `origin/site` and open the pull request against `site`. When a change on `main` alters behaviour, the page that documents it changes here too.

```bash
pnpm install
pnpm dev     # local preview
pnpm build   # static site in dist/
pnpm test    # checks the built site
```

The GitHub Actions workflow builds every pull request against `site` and deploys every push to it.

## License

MIT.
