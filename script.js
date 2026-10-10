//  Configuration

const USERNAME = "alibro005";

const EXTRA_EXCLUDED_OWNERS = [];

// 100 PRs per page
const MAX_PAGES = 3;

//   GitHub API
const API = "https://api.github.com";

const $ = (selector) => document.querySelector(selector);

const MIN_LOADER_TIME = 500;
const loaderStartedAt = performance.now();

function hidePageLoader() {
  const elapsed = performance.now() - loaderStartedAt;
  const remaining = Math.max(0, MIN_LOADER_TIME - elapsed);

  setTimeout(() => {
    document.body.classList.remove("is-loading");

    const loader = document.querySelector("#page-loader");

    if (loader) {
      loader.hidden = true;
      loader.style.display = "";
    }
  }, remaining);
}

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

const MERGE_ICON = `
<svg
  viewBox="0 0 16 16"
  aria-hidden="true"
>
  <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8.5-4.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM5 3.25a.75.75 0 1 0 0 .005V3.25Z"/>
</svg>
`;

let projects = [];

async function gh(url) {
  const key = "gh:" + url;
  const now = Date.now();

  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");

    // 1 hour cache
    if (cached && now - cached.t < 3600e3) {
      return cached.d;
    }
  } catch {
    // Ignore invalid cache
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  });

  if (!response.ok) {
    const error = new Error("GitHub API " + response.status);

    error.status = response.status;

    throw error;
  }

  const data = await response.json();

  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        t: now,
        d: data,
      }),
    );
  } catch {
    // Ignore localStorage errors
  }

  return data;
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const themeToggle = $("#theme-toggle");
const themeIcon = $("#theme-icon");

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;

  const isDark = theme === "dark";

  if (themeIcon) {
    themeIcon.textContent = isDark ? "☀" : "☾";
  }

  if (themeToggle) {
    themeToggle.setAttribute(
      "aria-label",
      isDark ? "Switch to light mode" : "Switch to dark mode",
    );

    themeToggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
  }
}

let savedTheme = null;

try {
  savedTheme = localStorage.getItem("contribs-theme");
} catch {
  // Storage may be unavailable.
}

setTheme(savedTheme === "light" || savedTheme === "dark" ? savedTheme : "dark");

themeToggle?.addEventListener("click", () => {
  const currentTheme = document.documentElement.dataset.theme;
  const nextTheme = currentTheme === "dark" ? "light" : "dark";

  setTheme(nextTheme);

  try {
    localStorage.setItem("contribs-theme", nextTheme);
  } catch {
    // Theme still works for this page session.
  }
});

async function load() {
  if (USERNAME === "YOUR_GITHUB_USERNAME") {
    $("#list").innerHTML = `
      <div class="state">
        Open <b>script.js</b> and set
        <b>USERNAME</b> to your GitHub username.
      </div>
    `;

    return;
  }

  try {
    const user = await gh(`${API}/users/${USERNAME}`);

    $("#avatar").src = user.avatar_url;

    $("#name").textContent = user.name || user.login;

    $("#handle").textContent = "@" + user.login;

    $("#bio").textContent = user.bio || "";

    $("#profile").href = user.html_url;

    document.title = `${user.name || user.login} · Open source contributions`;

    const excluded = [USERNAME, ...EXTRA_EXCLUDED_OWNERS]
      .map((owner) => `-user:${owner}`)
      .join(" ");

    const query = encodeURIComponent(
      `author:${USERNAME} type:pr is:merged is:public ${excluded}`,
    );

    let prs = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await gh(
        `${API}/search/issues?q=${query}&sort=updated&order=desc&per_page=100&page=${page}`,
      );

      prs.push(...data.items);

      if (data.items.length < 100) {
        break;
      }
    }

    const map = new Map();

    for (const pr of prs) {
      const full = pr.repository_url.replace(API + "/repos/", "");

      if (!map.has(full)) {
        map.set(full, {
          full,
          prs: [],
        });
      }

      map.get(full).prs.push({
        title: pr.title,
        url: pr.html_url,
        number: pr.number,
        merged: (pr.pull_request && pr.pull_request.merged_at) || pr.closed_at,
      });
    }

    projects = [...map.values()];

    projects.forEach((project) => {
      project.prs.sort((a, b) => new Date(b.merged) - new Date(a.merged));
    });

    $("#s-prs").textContent = prs.length;

    $("#s-repos").textContent = projects.length;

    $("#project-count").textContent =
      `${projects.length} project${projects.length === 1 ? "" : "s"}`;

    await Promise.allSettled(
      projects.slice(0, 40).map(async (project) => {
        const repo = await gh(`${API}/repos/${project.full}`);

        project.stars = repo.stargazers_count;

        project.lang = repo.language;

        project.desc = repo.description;
      }),
    );

    $("#s-stars").textContent = projects
      .reduce((total, project) => total + (project.stars || 0), 0)
      .toLocaleString();

    render();
    hidePageLoader();
  } catch (error) {
    const limited = error.status === 403 || error.status === 429;

    $("#list").innerHTML = `
      <div class="state">
        ${
          limited
            ? "GitHub's rate limit was reached. Wait a few minutes and reload."
            : `Couldn't load data from GitHub (${esc(error.message)}). Check that the username is correct.`
        }
      </div>
    `;
    hidePageLoader();
  }
}

function render() {
  const term = $("#q").value.trim().toLowerCase();

  const sort = $("#sort").value;

  let items = projects
    .map((project) => ({
      ...project,

      prs: project.prs.filter(
        (pr) =>
          !term ||
          project.full.toLowerCase().includes(term) ||
          pr.title.toLowerCase().includes(term),
      ),
    }))
    .filter((project) => project.prs.length);

  const sorters = {
    recent: (a, b) => new Date(b.prs[0].merged) - new Date(a.prs[0].merged),

    stars: (a, b) => (b.stars || 0) - (a.stars || 0),

    count: (a, b) => b.prs.length - a.prs.length,

    name: (a, b) => a.full.localeCompare(b.full),
  };

  items.sort(sorters[sort]);

  if (!items.length) {
    $("#list").innerHTML = `
      <div class="state">
        No merged pull requests
        match this filter.
      </div>
    `;

    return;
  }

  $("#list").innerHTML = items
    .map(
      (project) => `
          <section class="project">

            <div class="ph">

              <div class="ph-top">

                <a
                  class="pname"
                  href="https://github.com/${esc(project.full)}"
                  target="_blank"
                  rel="noopener"
                >
                  ${esc(project.full)}
                </a>

                <div class="meta">

                  ${project.lang ? `<span>${esc(project.lang)}</span>` : ""}

                  ${
                    project.stars != null
                      ? `
                        <span>
                          <span class="star">★</span>
                          ${project.stars.toLocaleString()}
                        </span>
                      `
                      : ""
                  }

                  <span>
                    ${project.prs.length}
                    merged
                  </span>

                </div>

              </div>

              ${
                project.desc
                  ? `
                    <p class="desc">
                      ${esc(project.desc)}
                    </p>
                  `
                  : ""
              }

            </div>


            ${project.prs
              .map(
                (pr) => `
                  <div class="pr">

                    <span class="ico">
                      ${MERGE_ICON}
                    </span>

                    <div>

                      <a
                        class="pr-title"
                        href="${esc(pr.url)}"
                        target="_blank"
                        rel="noopener"
                      >
                        ${esc(pr.title)}
                      </a>

                      <div class="pr-meta">
                        #${pr.number}
                        · merged on
                        ${fmtDate(pr.merged)}
                      </div>

                    </div>

                  </div>
                `,
              )
              .join("")}

          </section>
        `,
    )
    .join("");
}

$("#q").addEventListener("input", render);

$("#sort").addEventListener("change", render);

load();
