import { setupBookshelf } from "./bookshelf/bookshelf.js?v=20261119.1";

document.getElementById("copyright-year").textContent = new Date().getFullYear();

const sectionTabs = [...document.querySelectorAll(".section-tab")];
const sectionPanels = [...document.querySelectorAll(".section-panel")];
const booksTab = document.getElementById("books-tab");
const bookshelf = setupBookshelf(document.getElementById("books-panel"));

function showSection(selectedTab) {
  const selectedPanelId = selectedTab.getAttribute("aria-controls");

  sectionTabs.forEach((tab) => {
    const active = tab === selectedTab;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });

  sectionPanels.forEach((panel) => {
    panel.hidden = panel.id !== selectedPanelId;
  });

  if (selectedTab === booksTab) {
    if (window.location.hash !== "#books") history.replaceState(null, "", "#books");
    bookshelf.load();
  } else if (window.location.hash === "#books") {
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

sectionTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => showSection(tab));
  tab.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? sectionTabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + sectionTabs.length) % sectionTabs.length;
    sectionTabs[nextIndex].focus();
    showSection(sectionTabs[nextIndex]);
  });
});

if (window.location.hash === "#books") showSection(booksTab);
window.addEventListener("hashchange", () => {
  if (window.location.hash === "#books") showSection(booksTab);
});
