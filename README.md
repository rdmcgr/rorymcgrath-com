# RoryMcGrath.com Root Site

This project is a clean scaffold for the root website at `rorymcgrath.com`.

## Deployment target

GitHub Actions deploys this project to:

- `public_html/`

That target is intentionally different from The League project, which deploys to:

- `public_html/hosted/the-league/`

## Files

- `index.html` - starter homepage
- `styles.css` - visual system for the scaffold
- `app.js` - lightweight JS entry point
- `.github/workflows/deploy.yml` - Bluehost deployment workflow

## Updating Books on My Shelves

Run the import with Python 3.8 or later and the complete CSV, including the
existing books and any additions.

```sh
python3 .github/scripts/import-bookshelf.py /path/to/bookshelf.csv
```

The importer accepts UTF-8 and MacRoman CSVs with `Title` and `Author` columns.
`Category` and `Sub Category` are optional. It regenerates
`bookshelf/catalog.json` using the saved cover choices. Books without a cover
choice get a placeholder. The original CSV can stay in Google Drive.

To add or replace approved covers, pass an export from the cover review.

```sh
python3 .github/scripts/import-bookshelf.py /path/to/bookshelf.csv --covers /path/to/bookshelf-selected-covers.json
```

This updates `.github/bookshelf-covers.json` by title and author and keeps earlier
cover choices. The Bluehost workflow excludes `.github/` from deployment.
Commit the updated catalog and any cover-registry changes. Preview the tab at
`/#books` from a local HTTP server before merging to `main`.

## Before first deployment

1. Create a separate GitHub repository for this folder.
2. Add the `BLUEHOST_SSH_KEY` secret in GitHub.
3. Verify the root site should deploy to `public_html/`.
