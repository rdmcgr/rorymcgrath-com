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

## Borrowing requests

The book-details dialog sends requests to `bookshelf/borrow.php`. The endpoint
checks the book against the current catalog, so future CSV imports update the
list of books that can be requested.

Set the `BOOKSHELF_BORROW_RECIPIENT` repository Actions secret to configure the
notification recipient on the next deployment. The deploy workflow writes the
configuration directly on Bluehost, using `bookshelf@rorymcgrath.com` as the
sender. To manage the configuration manually, leave the secret unset.

Keep the configuration in a private, writable `bookshelf-private` directory
beside `public_html` on Bluehost. Create `borrow-config.php` there using the
following format and set the real recipient and a sender authorized by the host.

```php
<?php
return [
    'mode' => 'email',
    'recipient' => 'recipient@example.test',
    'sender' => 'sender@example.test',
];
```

The endpoint uses PHP's mail transport and sets Reply-To to the visitor's email.
Verify delivery to the intended inbox before announcing the feature.

For local testing, create a private config outside the served checkout that
returns `['mode' => 'preview']`. Point `BOOKSHELF_BORROW_CONFIG` to it and run
`php -S 127.0.0.1:8766` from the checkout. The endpoint saves test requests in
`borrow-inbox.jsonl` beside the private configuration.

## Before first deployment

1. Create a separate GitHub repository for this folder.
2. Add the `BLUEHOST_SSH_KEY` secret in GitHub.
3. Verify the root site should deploy to `public_html/`.
