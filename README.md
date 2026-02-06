# Stoneman Photography

Wildlife and nature photography portfolio website.

## How to Make Edits on GitHub

You can edit this site directly on GitHub — no special software needed. Click any file, then click the **pencil icon** (top-right of the file view) to start editing. When you're done, click **Commit changes**.

> Look for `<!-- ✏️ EDIT: ... -->` comments in the HTML files — they mark the sections you'll change most often.

---

### Change Text on the About Page

1. Open **about.html**
2. Find the `<!-- ✏️ EDIT: About page text -->` comment
3. Edit the text inside the `<p>` tags
4. Replace `[Location]` with your actual location
5. Commit changes

### Add a New Blog Post

1. Open **blog.html**
2. Find the `<!-- ✏️ EDIT: Blog posts below -->` comment
3. Copy this template and paste it **right after** that comment (before the existing posts):

```html
        <article class="blog-post">
            <h2>Your Post Title</h2>
            <span class="blog-date">Month Day, Year</span>
            <p>
                Your post excerpt or full text goes here.
            </p>
            <a href="#" class="read-more">Read more &rarr;</a>
        </article>
```

4. Fill in your title, date, and text
5. Commit changes

### Add a Portfolio Image

1. First, upload your image to the `images/` folder in your repo (create the folder if it doesn't exist)
2. Open **portfolio.html**
3. Find the `<!-- ✏️ ADD NEW IMAGES HERE -->` comment
4. Add a new item:

```html
        <div class="gallery-item" data-category="wildlife">
            <img src="images/your-photo.jpg" alt="Short description of the photo">
        </div>
```

5. Set `data-category` to `wildlife` or `other` (must match a filter button)
6. The masonry layout handles any image size or aspect ratio automatically
7. Commit changes

### Change the Featured Images on the Home Page

1. Open **index.html**
2. Find the `<!-- ✏️ EDIT: Featured images -->` comment
3. Edit the `<span>` text inside each `featured-item` (or replace with `<img>` tags when you have images)

### Update Contact Info

1. Open **contact.html**
2. Find the `<!-- ✏️ EDIT: Contact page heading -->` comment to change the intro text
3. Find the `<!-- ✏️ EDIT: Contact form -->` comment for instructions on connecting the form to a service like Formspree

---

## File Structure

```
index.html        - Home page (hero + featured images)
portfolio.html    - Photo gallery with category filters
blog.html         - Blog posts (newest first)
about.html        - About / bio page
contact.html      - Contact form
css/style.css     - All styles
js/script.js      - Menu toggle, gallery filter, lightbox, form validation
```
