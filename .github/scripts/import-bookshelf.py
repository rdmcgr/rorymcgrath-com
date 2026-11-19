#!/usr/bin/env python3
"""Generate the public bookshelf catalog from the complete CSV and approved covers."""

import argparse
import csv
import io
import json
import re
import tempfile
import unicodedata
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[2]
COVER_REGISTRY = ROOT / ".github" / "bookshelf-covers.json"
CATALOG = ROOT / "bookshelf" / "catalog.json"


def book_key(title, author):
    def normalize(value):
        value = unicodedata.normalize("NFD", value.casefold())
        value = "".join(char for char in value if not unicodedata.combining(char))
        return " ".join(value.replace("’", "'").replace("‘", "'").split())

    return normalize(title), normalize(author)


def read_books(path):
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("mac_roman")

    reader = csv.DictReader(io.StringIO(text, newline=""), strict=True)
    columns = {
        re.sub(r"[\s_-]+", "", field.casefold()): field
        for field in (reader.fieldnames or [])
    }
    if not {"title", "author"} <= columns.keys():
        raise ValueError("The CSV needs Title and Author columns.")

    books = []
    for row in reader:
        if None in row or any(value is None for value in row.values()):
            raise ValueError(f"CSV line {reader.line_num} has the wrong number of fields.")
        if not any(value.strip() for value in row.values()):
            continue

        title = row[columns["title"]].strip()
        author = row[columns["author"]].strip()
        if not title or not author:
            raise ValueError(f"CSV line {reader.line_num} needs a title and author.")

        book = {
            "title": title,
            "author": author,
            "category": row.get(columns.get("category"), "").strip() or "Uncategorized",
        }
        subcategory = row.get(columns.get("subcategory"), "").strip()
        if subcategory:
            book["subcategory"] = subcategory
        books.append(book)

    if not books:
        raise ValueError("The CSV has no book entries.")
    return books


def https_url(value):
    if not isinstance(value, str) or any(char.isspace() for char in value):
        raise ValueError("Cover and source URLs must be valid HTTPS URLs.")
    url = urlsplit(value)
    if url.scheme != "https" or not url.hostname or url.username or url.password is not None:
        raise ValueError("Cover and source URLs must be valid HTTPS URLs.")
    return value


def read_covers(path):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("covers"), list):
        raise ValueError(f"{path.name} must be a version 1 cover export.")

    covers = {}
    for entry in data["covers"]:
        if not isinstance(entry, dict):
            raise ValueError(f"{path.name} contains an invalid cover entry.")
        title, author = entry.get("title"), entry.get("author")
        if not all(isinstance(value, str) and value.strip() for value in (title, author)):
            raise ValueError(f"{path.name} contains a cover without a title or author.")
        key = book_key(title, author)
        if key in covers:
            raise ValueError(f"{path.name} has multiple cover choices for {title}.")

        cover = {"title": title.strip(), "author": author.strip()}
        if "coverId" in entry:
            cover_id, work_id = entry["coverId"], entry.get("workId")
            if type(cover_id) is not int or cover_id <= 0 or not isinstance(work_id, str) or not re.fullmatch(r"OL\d+W", work_id):
                raise ValueError(f"Invalid Open Library cover for {title}.")
            cover.update(coverId=cover_id, workId=work_id)
        else:
            cover.update(coverUrl=https_url(entry.get("coverUrl")), sourceUrl=https_url(entry.get("sourceUrl")))
        covers[key] = cover
    return covers


def public_cover(cover):
    if "coverId" in cover:
        return {
            "image": f"https://covers.openlibrary.org/b/id/{cover['coverId']}-M.jpg?default=false",
            "source": f"https://openlibrary.org/works/{cover['workId']}",
        }
    return {"image": cover["coverUrl"], "source": cover["sourceUrl"]}


def write_json(path, value):
    # Keep the existing file readable until the replacement is complete.
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as file:
        temp_path = Path(file.name)
        try:
            json.dump(value, file, ensure_ascii=False, indent=2)
            file.write("\n")
            file.close()
            temp_path.chmod(0o644)
            temp_path.replace(path)
        finally:
            temp_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_file", type=Path, help="Complete bookshelf CSV")
    parser.add_argument("--covers", type=Path, help="Newly exported or corrected cover choices")
    args = parser.parse_args()

    try:
        books = read_books(args.csv_file)
        approvals = read_covers(COVER_REGISTRY) if COVER_REGISTRY.exists() else {}
        if args.covers:
            approvals.update(read_covers(args.covers))
        for book in books:
            approval = approvals.get(book_key(book["title"], book["author"]))
            if approval:
                book["cover"] = public_cover(approval)

        if args.covers:
            write_json(COVER_REGISTRY, {"version": 1, "covers": list(approvals.values())})
        write_json(CATALOG, {"books": books})
    except (OSError, ValueError, csv.Error) as error:
        parser.exit(1, f"Import failed: {error}\n")

    with_covers = sum("cover" in book for book in books)
    print(f"Generated {len(books)} books, {with_covers} approved covers, and {len(books) - with_covers} placeholders.")


if __name__ == "__main__":
    main()
