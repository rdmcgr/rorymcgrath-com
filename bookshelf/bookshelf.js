const pageSize = 10;
const jacketColors = ["atlas", "signal", "rain", "mountain", "paper"];

function normalize(text) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/[’‘]/g, "'").toLowerCase();
}

export function setupBookshelf(panel) {
  const catalog = panel.querySelector("#books-catalog");
  const loading = panel.querySelector("#books-loading");
  const retry = panel.querySelector("#books-retry");
  const search = panel.querySelector("#books-search");
  const category = panel.querySelector("#books-category");
  const count = panel.querySelector("#books-count");
  const collection = panel.querySelector(".books-list");
  const template = panel.querySelector("#book-tile");
  const pages = panel.querySelector(".books-pages");
  const previous = panel.querySelector("#books-previous");
  const next = panel.querySelector("#books-next");
  const viewButtons = [...panel.querySelectorAll("[data-books-view]")];
  const dialog = panel.querySelector(".book-dialog");
  const dialogCover = dialog.querySelector(".book-dialog-cover");
  const dialogTitle = dialog.querySelector("#book-dialog-title");
  const dialogAuthor = dialog.querySelector(".book-dialog-author");
  const dialogCategory = dialog.querySelector(".book-dialog-category");

  const borrowToggle = dialog.querySelector(".book-borrow-toggle");
  const borrowForm = dialog.querySelector("#book-borrow-form");
  const borrowName = borrowForm.elements.namedItem("name");
  const borrowSubmit = borrowForm.querySelector("button[type=submit]");
  const borrowStatus = dialog.querySelector(".book-borrow-status");

  let bookDetails;
  let books;
  let pending = false;
  let page = 0;

  function fillJacket(jacket, book) {
    jacket.classList.add(`book-jacket--${book.color}`);
    jacket.querySelector("strong").textContent = book.title.split(":")[0];
    jacket.querySelector("span").textContent = book.author;
    if (!book.cover) return;

    const image = document.createElement("img");
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.className = "book-cover-image";
    image.addEventListener("load", () => {
      if (image.naturalWidth > 1 && image.naturalHeight > 1) {
        image.classList.add("is-loaded");
      }
    }, { once: true });
    image.addEventListener("error", () => image.remove(), { once: true });
    image.src = book.cover.image;
    jacket.append(image);
  }

  function showDetails(book) {
    const jacket = template.content.querySelector(".book-jacket").cloneNode(true);
    fillJacket(jacket, book);
    dialogCover.replaceChildren(jacket);
    dialogTitle.textContent = book.title;
    dialogAuthor.textContent = book.author;
    dialogCategory.textContent = [book.category, book.subcategory].filter(Boolean).join(" · ");
    bookDetails = { title: book.title, author: book.author };
    borrowForm.reset();
    borrowForm.hidden = true;
    borrowToggle.hidden = false;
    borrowToggle.setAttribute("aria-expanded", "false");
    borrowSubmit.disabled = false;
    borrowSubmit.textContent = "Send request";
    borrowStatus.textContent = "";
    dialog.showModal();
  }

  function render() {
    const query = normalize(search.value.trim());
    const matches = books.filter(book =>
      (!category.value || book.category === category.value) && book.searchText.includes(query)
    );
    const start = page * pageSize;
    const end = Math.min(start + pageSize, matches.length);
    collection.replaceChildren(...matches.slice(start, end).map(book => {
      const item = template.content.firstElementChild.cloneNode(true);
      const button = item.querySelector(".book-tile");
      fillJacket(item.querySelector(".book-jacket"), book);
      item.querySelector(".book-title").textContent = book.title;
      item.querySelector(".book-author").textContent = book.author;
      item.querySelector(".book-category").textContent = book.category;
      button.addEventListener("click", () => showDetails(book));
      return item;
    }));

    if (!matches.length) count.textContent = "No matching books";
    else if (matches.length === 1) count.textContent = "1 book";
    else count.textContent = `${start + 1}–${end} of ${matches.length} books`;
    pages.hidden = matches.length <= pageSize;
    previous.disabled = page === 0;
    next.disabled = end === matches.length;
  }

  function resetPage() {
    page = 0;
    render();
  }

  function changePage(direction) {
    page += direction;
    render();
    collection.querySelector(".book-tile")?.focus();
  }

  async function load() {
    if (books || pending) return;
    pending = true;
    loading.hidden = false;
    loading.textContent = "Loading books…";
    retry.hidden = true;
    try {
      const response = await fetch(new URL("./catalog.json", import.meta.url), { cache: "no-cache" });
      if (!response.ok) throw new Error(`Catalog response: ${response.status}`);

      const data = await response.json();
      const entries = data.books.map(book => {
        const searchText = normalize(`${book.title} ${book.author}`);
        let colorIndex = 0;
        for (const letter of searchText) {
          colorIndex = (colorIndex * 31 + letter.codePointAt(0)) % jacketColors.length;
        }
        return { ...book, searchText, color: jacketColors[colorIndex] };
      });
      const categories = [...new Set(entries.map(book => book.category))].sort();
      category.replaceChildren(new Option("All categories", ""), ...categories.map(value => new Option(value)));
      books = entries;
      render();
      catalog.hidden = false;
      loading.hidden = true;
    } catch {
      books = undefined;
      loading.textContent = "The bookshelf couldn’t load.";
      retry.hidden = false;
    } finally {
      pending = false;
    }
  }

  borrowToggle.addEventListener("click", () => {
    borrowForm.hidden = !borrowForm.hidden;
    borrowToggle.setAttribute("aria-expanded", String(!borrowForm.hidden));
    if (!borrowForm.hidden) borrowName.focus();
  });

  borrowForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (borrowSubmit.disabled) return;

    const requestedBook = bookDetails;
    const fields = Object.fromEntries(new FormData(borrowForm));
    borrowSubmit.disabled = true;
    borrowSubmit.textContent = "Sending…";
    borrowStatus.textContent = "";

    try {
      const response = await fetch(borrowForm.action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, book: requestedBook }),
      });
      const result = await response.json();
      if (requestedBook !== bookDetails || !dialog.open) return;

      if (!response.ok || result.ok !== true) {
        borrowStatus.textContent = result.message || "The request couldn’t be sent. Please try again.";
        return;
      }

      borrowForm.reset();
      borrowForm.hidden = true;
      borrowToggle.hidden = true;
      borrowToggle.setAttribute("aria-expanded", "false");
      dialog.querySelector("[autofocus]").focus();
      borrowStatus.textContent = result.preview
        ? "Request saved to the local test inbox."
        : "Request sent. I’ll get back to you about borrowing this book.";
    } catch {
      if (requestedBook === bookDetails && dialog.open) {
        borrowStatus.textContent = "The request couldn’t be sent. Please try again.";
      }
    } finally {
      if (requestedBook === bookDetails) {
        borrowSubmit.disabled = false;
        borrowSubmit.textContent = "Send request";
      }
    }
  });

  retry.addEventListener("click", load);
  search.addEventListener("input", resetPage);
  category.addEventListener("change", resetPage);
  previous.addEventListener("click", () => changePage(-1));
  next.addEventListener("click", () => changePage(1));
  for (const button of viewButtons) {
    button.addEventListener("click", () => {
      collection.dataset.view = button.dataset.booksView;
      for (const view of viewButtons) view.setAttribute("aria-pressed", String(view === button));
    });
  }

  return { load };
}
