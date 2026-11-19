import { setupBookshelf } from "./bookshelf/bookshelf.js?v=20261119.2";

document.getElementById("copyright-year").textContent = new Date().getFullYear();

const sectionTabs = [...document.querySelectorAll(".section-tab")];
const sectionPanels = [...document.querySelectorAll(".section-panel")];
const travelTab = document.getElementById("travel-tab");
const booksTab = document.getElementById("books-tab");
const bookshelf = setupBookshelf(document.getElementById("books-panel"));
const sectionLinks = new Map([
  ["#sidequests", document.getElementById("projects-tab")],
  ["#books", booksTab],
]);

function showSection(selectedTab, updateLocation = false) {
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

  if (updateLocation) {
    const directLink = [...sectionLinks].find(([, tab]) => tab === selectedTab)?.[0];
    if (directLink && window.location.hash !== directLink) {
      history.replaceState(null, "", directLink);
    } else if (!directLink && sectionLinks.has(window.location.hash)) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }

  if (selectedTab === booksTab) bookshelf.load();
}

sectionTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => showSection(tab, true));
  tab.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? sectionTabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + sectionTabs.length) % sectionTabs.length;
    sectionTabs[nextIndex].focus();
    showSection(sectionTabs[nextIndex], true);
  });
});

function showLinkedSection() {
  showSection(sectionLinks.get(window.location.hash) ?? travelTab);
}

showLinkedSection();
window.addEventListener("hashchange", showLinkedSection);
