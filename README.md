# Stoneman Photography

Wildlife and nature photography portfolio: **https://stonemanphotography.co.uk**

Plain HTML, CSS and JavaScript with no framework and no build step. It's hosted on Cloudflare Pages, which redeploys automatically whenever the `master` branch on GitHub changes (usually within a minute or two).

---

## Day-to-day editing: use the Site Manager

Go to **https://stonemanphotography.co.uk/admin.html** and connect with your GitHub token. That token is only stored in your browser. If it expires, make a new fine-grained token on GitHub with *Contents: read & write* access to this repo.

Every save in the Site Manager is a commit to `master`, so the live site updates shortly afterwards.

| Tab | What you can do |
|---|---|
| **Photos** | Upload new photos (camera settings are read automatically and the thumbnail is made for you), edit titles and details, reorder, remove, choose featured photos and their order on the home page, set the Spotlight photo |
| **Hero** | Change the home page hero image and where the text sits |
| **Blog** | Write posts with the block editor: text, uploaded images or existing portfolio photos, with image size, placement and text-wrap |
| **Categories** | Add, rename or remove portfolio categories |
| **Text** | Home page title and tagline, About page heading, subheading and bio, portfolio blurb |

You shouldn't need to touch any code for adding photos, blog posts or changing text.

---

## Working on a copy on your computer

The Site Manager saves straight to GitHub, so a copy on your computer goes out of date every time you use it.

**Always run `git pull` before changing anything locally**, then commit and push as usual.

---

## How the site is put together

```
index.html         Home page (hero + featured photos)
portfolio.html     Gallery with category filters + lightbox
blog.html          Blog list and posts
about.html         About page (bio text sits between <!-- edit:about-bio --> markers)
contact.html       Contact form (Formspree)
copyright.html     Copyright & image use
admin.html         Site Manager (not indexed by search engines)

content.json       Site settings, featured photos, portfolio, blog posts, categories
css/style.css      All styles
js/script.js       Loads content.json and builds the pages
js/admin.js        Site Manager logic (talks to the GitHub API)

images/Full res/   Full-size photos (opened in the lightbox)
images/Thumb/      Thumbnails, same filenames as Full res
images/Hero/       Home page hero images
images/Blog/       Images uploaded for blog posts
images/About blog/ About page photo

sitemap.xml, robots.txt, _headers   SEO and crawler settings
```

**Cache-busting:** the HTML files load `js/script.js?v=N`. If you change `script.js` or `style.css`, bump the number in every HTML file so visitors get the new version.

**Folders that are never published:** `Pictures/`, `Archive/`, `Assets/`, `memory/`, `.claude/` (listed in `.gitignore`).
