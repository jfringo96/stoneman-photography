/* ==========================================================
   STONEMAN PHOTOGRAPHY - Main JavaScript

   This file handles all interactive features on the site:
   0. Content loading from content.json (colours, gallery, about, blog)
   1. Mobile hamburger menu (open/close)
   2. Active page highlighting in the navigation
   3. Portfolio category filter buttons
   4. Lightbox with EXIF metadata (works on portfolio + home)
   5. Contact form validation
   6. Right-click block on images
   ========================================================== */


/* ----------------------------------------------------------
   PHOTO METADATA
   Hardcoded fallback data used if content.json fetch fails.
   Overridden at runtime by populatePhotoData() on success.
   ---------------------------------------------------------- */

var photoData = {
    'Dawn-Chorus.jpg':           { title: 'Dawn Chorus',           camera: 'OM System OM-1 Mark II',  lens: 'Olympus 300mm F4.0',          focal: '300mm',  shutter: '1/4000', aperture: 'f/4',   iso: '5000', date: '5 Apr 2026'  },
    'Over-the-Shoulder.jpg':     { title: 'Over the Shoulder',     camera: 'OM System OM-1 Mark II',  lens: 'Olympus 300mm F4.0',          focal: '300mm',  shutter: '1/1600', aperture: 'f/4',   iso: '1250', date: '5 Apr 2026'  },
    'Beautiful-Morning.jpg':     { title: 'Beautiful Morning',     camera: 'OM System OM-1 Mark II',  lens: 'Olympus 300mm F4.0',          focal: '300mm',  shutter: '1/4000', aperture: 'f/4',   iso: '4000', date: '5 Apr 2026'  },
    'Golden-Gazelle.jpg':        { title: 'Golden Gazelle',        camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '374mm',  shutter: '1/1000', aperture: 'f/6.3', iso: '2000', date: '3 Feb 2026'  },
    'Samburu-Zebra.jpg':         { title: 'Samburu Zebra',         camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '400mm',  shutter: '1/2500', aperture: 'f/6.3', iso: '1000', date: '1 Feb 2026'  },
    'Leopard.jpg':               { title: 'Leopard',               camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '400mm',  shutter: '1/1600', aperture: 'f/6.3', iso: '2500', date: '2 Feb 2026'  },
    'Crescent Island Monkey.jpg':{ title: 'Crescent Island Monkey',camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '400mm',  shutter: '1/2500', aperture: 'f/6.3', iso: '1250', date: '28 Jan 2026' },
    'Above-the-Trees.jpg':       { title: 'Above the Trees',       camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '123mm',  shutter: '1/3200', aperture: 'f/5.4', iso: '800',  date: '28 Jan 2026' },
    'Head-On.jpg':               { title: 'Head-On',               camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '400mm',  shutter: '1/1600', aperture: 'f/6.3', iso: '640',  date: '2 Sep 2025'  },
    'Blue-Dragonfly.jpg':        { title: 'Blue Dragonfly',        camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '400mm',  shutter: '1/1000', aperture: 'f/6.3', iso: '1000', date: '26 Aug 2025' },
    'Yum!.jpg':                  { title: 'Yum!',                  camera: 'OM System OM-1 Mark II',  lens: 'Olympus 300mm F4.0',          focal: '300mm',  shutter: '1/3200', aperture: 'f/4',   iso: '1250', date: '11 Mar 2026' },
    'Through-the-Grass.jpg':     { title: 'Through the Grass',     camera: 'OM System OM-1 Mark II',  lens: 'Olympus 300mm F4.0',          focal: '300mm',  shutter: '1/4000', aperture: 'f/4',   iso: '400',  date: '15 Apr 2026' },
    'Squirrel.jpg':              { title: 'Squirrel',              camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '400mm',  shutter: '1/2000', aperture: 'f/6.3', iso: '3200', date: '20 Feb 2026' },
    'Buzzing-off.jpg':           { title: 'Buzzing Off',           camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '400mm',  shutter: '1/2000', aperture: 'f/6.3', iso: '1000', date: '17 Jan 2026' },
    'Nectar.jpg':                { title: 'Nectar',                camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '400mm',  shutter: '1/1600', aperture: 'f/6.3', iso: '1250', date: '17 Jan 2026' },
    'Damp-Start.jpg':            { title: 'Damp Start',            camera: 'OM System OM-5',          lens: 'OM 12-40mm F2.8 II',          focal: '40mm',   shutter: '1/1000', aperture: 'f/6.3', iso: '1600', date: '27 Aug 2025' },
    'Evening-Swans.jpg':         { title: 'Evening Swans',         camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '186mm',  shutter: '1/1600', aperture: 'f/6.3', iso: '64',   date: '21 Nov 2025' },
    'Last-Flight.jpg':           { title: 'Last Flight',           camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '400mm',  shutter: '1/1600', aperture: 'f/6.3', iso: '80',   date: '21 Jan 2026' },
    'Evening-Cormorant.jpg':     { title: 'Evening Cormorant',     camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '100mm',  shutter: '1/640',  aperture: 'f/9',   iso: '200',  date: '2 Mar 2025'  },
    'From-My-Window.jpg':        { title: 'From My Window',        camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '400mm',  shutter: '1/3200', aperture: 'f/6.3', iso: '1250', date: '30 Dec 2025' },
    'Kestrel.jpg':               { title: 'Kestrel',               camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '276mm',  shutter: '1/1600', aperture: 'f/6.3', iso: '1600', date: '27 Nov 2025' },
    'La-Palma-Lizard.jpg':       { title: 'La Palma Lizard',       camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '400mm',  shutter: '1/1600', aperture: 'f/8',   iso: '500',  date: '20 Jan 2026' },
    'Coot.jpg':                  { title: 'Coot',                  camera: 'OM System OM-1 Mark II',  lens: 'Olympus 300mm F4.0',          focal: '300mm',  shutter: '1/1600', aperture: 'f/4',   iso: '640',  date: '16 May 2026' },
    'Eyes.jpg':                  { title: 'Eyes',                  camera: 'OM System OM-1 Mark II',  lens: 'OM 60mm F2.8 Macro',          focal: '60mm',   shutter: '1/250',  aperture: 'f/3.5', iso: '2500', date: '14 Jul 2026' },
    'Lone-Squirrel.jpg':         { title: 'Lone Squirrel',         camera: 'OM System OM-1 Mark II',  lens: 'Olympus 300mm F4.0',          focal: '300mm',  shutter: '1/2000', aperture: 'f/4',   iso: '2000', date: '12 Jul 2026' },
    'Autumn-Mandarin.jpg':       { title: 'Autumn Mandarin',       camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '400mm',  shutter: '1/500',  aperture: 'f/6.3', iso: '2500', date: '15 Nov 2025' },
    'Autumn-Glow.jpg':           { title: 'Autumn Glow',           camera: 'OM System OM-5',          lens: 'OM 60mm F2.8 Macro',          focal: '60mm',   shutter: '1/25',   aperture: 'f/3.2', iso: '640',  date: '31 Oct 2025' },
    'Curious.jpg':               { title: 'Curious',               camera: 'OM System OM-5',          lens: 'Lumix G 45-200mm F4.0-5.6',   focal: '200mm',  shutter: '1/500',  aperture: 'f/5.6', iso: '6400', date: '10 Jan 2025' },
    'Golden-Grebe.jpg':          { title: 'Golden Grebe',          camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '400mm',  shutter: '1/1250', aperture: 'f/6.3', iso: '250',  date: '2 Feb 2025'  },
    'Blended-Sunrise.jpg':       { title: 'Blended Sunrise',       camera: 'OM System OM-5',          lens: 'OM 12-40mm F2.8 II',          focal: '22mm',   shutter: '1/60',   aperture: 'f/6.3', iso: '250',  date: '29 Aug 2025' },
    'London.jpg':                { title: 'London',                camera: 'OM System OM-5',          lens: 'OM 12-40mm F2.8 II',          focal: '16mm',   shutter: '1/320',  aperture: 'f/2.8', iso: '200',  date: '15 Feb 2026' },
    'Golden-Thames.jpg':         { title: 'Golden Thames',         camera: 'OM System OM-5',          lens: 'OM 12-40mm F2.8 II',          focal: '23mm',   shutter: '1/1000', aperture: 'f/9',   iso: '200',  date: '21 May 2025' },
    'Moody-Thames.jpg':          { title: 'Moody Thames',          camera: 'OM System OM-5',          lens: 'Olympus 14-42mm F3.5-5.6 EZ', focal: '42mm',   shutter: '1/250',  aperture: 'f/8',   iso: '160',  date: '6 Jan 2025'  },
    'HMS-Belfast.jpg':           { title: 'HMS Belfast',           camera: 'OM System OM-5',          lens: 'Olympus 14-42mm F3.5-5.6 EZ', focal: '42mm',   shutter: '1/250',  aperture: 'f/8',   iso: '200',  date: '6 Jan 2025'  },
    'The-Eye.jpg':               { title: 'The Eye',               camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '285mm',  shutter: '1/640',  aperture: 'f/7.1', iso: '200',  date: '15 Aug 2025' },
    'Chamonix.jpg':              { title: 'Chamonix',              camera: 'OM System OM-1 Mark II',  lens: 'OM 12-40mm F2.8 II',          focal: '19mm',   shutter: '1/2000', aperture: 'f/5.6', iso: '200',  date: '19 Apr 2026' },
    'Cold-Mountains.jpg':        { title: 'Cold Mountains',        camera: 'Olympus E-PL9',           lens: 'Olympus 14-42mm F3.5-5.6 EZ', focal: '30mm',   shutter: '1/500',  aperture: 'f/11',  iso: '200',  date: '27 Nov 2024' },
    'Cable-Car.jpg':             { title: 'Cable Car',             camera: 'OM System OM-5',          lens: 'OM 12-40mm F2.8 II',          focal: '35mm',   shutter: '1/200',  aperture: 'f/11',  iso: '200',  date: '12 Dec 2025' },
    'Golden-Greenwich.jpg':      { title: 'Golden Greenwich',      camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '100mm',  shutter: '1/200',  aperture: 'f/5',   iso: '200',  date: '23 Jan 2025' },
    'Hampstead-Heath.jpg':       { title: 'Hampstead Heath',       camera: 'Olympus E-PL9',           lens: 'Lumix G 45-200mm F4.0-5.6',   focal: '84mm',   shutter: '1/500',  aperture: 'f/8',   iso: '200',  date: '27 Oct 2024' },
    'Ladder-to-the-Sea.jpg':     { title: 'Ladder to the Sea',     camera: 'OM System OM-5',          lens: 'OM 12-40mm F2.8 II',          focal: '12mm',   shutter: '1/160',  aperture: 'f/9',   iso: '200',  date: '8 Mar 2025'  },
    'Poon-Hill.jpg':             { title: 'Poon Hill',             camera: 'Olympus E-PL9',           lens: 'Olympus 14-42mm F3.5-5.6 EZ', focal: '42mm',   shutter: '1/160',  aperture: 'f/7.1', iso: '200',  date: '27 Nov 2024' },
    'Lighthouse.jpg':            { title: 'Lighthouse',            camera: 'Google Pixel 8a',         lens: 'Pixel 8a',                    focal: '5mm',    shutter: '1/2500', aperture: 'f/1.9', iso: '47',   date: '25 Oct 2025' },
    'Winter-Walk.jpg':           { title: 'Winter Walk',           camera: 'OM System OM-5',          lens: 'Olympus 14-42mm F3.5-5.6 EZ', focal: '42mm',   shutter: '1/125',  aperture: 'f/10',  iso: '200',  date: '11 Jan 2025' },
    "Villeneuve's-Tree.jpg":     { title: "Villeneuve's Tree",     camera: 'OM System OM-5',          lens: 'OM 12-40mm F2.8 II',          focal: '40mm',   shutter: '1/160',  aperture: 'f/9',   iso: '200',  date: '9 Dec 2025'  },
    'Colourful-London.jpg':      { title: 'Colourful London',      camera: 'OM System OM-5',          lens: 'OM 12-40mm F2.8 II',          focal: '12mm',   shutter: '1/60',   aperture: 'f/10',  iso: '4000', date: '17 Feb 2025' }
};

var msnry = null;
var galleryLoader = null;   // batch loader for the Portfolio gallery (set up with Masonry)


/* ----------------------------------------------------------
   SECTION 0 — CONTENT LOADING
   Fetches content.json and populates the page before wiring
   up any interactive behaviour. Falls back gracefully if the
   fetch fails (e.g. file:// protocol during local dev).
   ---------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', function () {
    // Cache-bust so edits made in the Site Manager show up immediately rather than
    // waiting for the CDN/browser cache of content.json to expire.
    fetch('content.json?t=' + Date.now())
        .then(function (response) { return response.json(); })
        .then(function (content) {
            applySettings(content.settings);
            // Categories marked hidden (e.g. ones made for a blog post's or
            // project's own photos) never appear on the Portfolio page.
            var hiddenCats = {};
            (content.categories || []).forEach(function (c) { if (c.hidden) hiddenCats[c.key] = true; });
            populateCategories((content.categories || []).filter(function (c) { return !c.hidden; }));
            if (content.portfolio && content.portfolio.length) {
                var onPortfolio = content.portfolio.filter(function (p) { return !hiddenCats[p.category]; });
                populatePhotoData(content.portfolio);
                populatePortfolioGallery(onPortfolio);
                populateFeaturedImages(content.portfolio, content.featured_images, onPortfolio);
            }
            populateBlog(content.blog);
            populateProjectsList(content.projects);
            populateProjectDetail(content.projects);
            initLayoutViewer();
            initCarousels();
            initCompares();
            initInteractivity();
        })
        .catch(function () {
            // content.json unavailable — existing hardcoded HTML and photoData take over.
            // The project pages have no hardcoded fallback (they are built entirely from
            // content.json), so they say so rather than sitting empty.
            projectsUnavailable();
            initInteractivity();
        });
});


/* Apply CSS custom properties for site colours and inject hero text on index.html. */
function applySettings(settings) {
    if (!settings) return;
    var root = document.documentElement;
    if (settings.background_colour) root.style.setProperty('--colour-bg',       settings.background_colour);
    if (settings.text_colour)        root.style.setProperty('--colour-text',     settings.text_colour);
    if (settings.accent_colour)      root.style.setProperty('--colour-accent',   settings.accent_colour);
    if (settings.nav_background)     root.style.setProperty('--colour-nav-bg',   settings.nav_background);
    if (settings.nav_text_colour)    root.style.setProperty('--colour-nav-text', settings.nav_text_colour);

    var heroH1 = document.querySelector('.hero-content h1');
    if (heroH1 && settings.site_name) {
        var lastSpace = settings.site_name.lastIndexOf(' ');
        heroH1.innerHTML = lastSpace !== -1
            ? settings.site_name.slice(0, lastSpace) + '<br>' + settings.site_name.slice(lastSpace + 1)
            : settings.site_name;
    }
    var heroP = document.querySelector('.hero-content p');
    if (heroP && settings.tagline) heroP.textContent = settings.tagline;
}

/* Merge portfolio entries from content.json into the photoData lookup. */
function populatePhotoData(portfolio) {
    portfolio.forEach(function (photo) {
        photoData[photo.filename] = {
            title:    photo.title,
            camera:   photo.camera,
            lens:     photo.lens,
            focal:    photo.focal,
            shutter:  photo.shutter,
            aperture: photo.aperture,
            iso:      photo.iso,
            date:     photo.date
        };
    });
}

/* Build the masonry gallery on portfolio.html from content.json.
   Clears any hardcoded items, rebuilds from the portfolio array, then fades
   the gallery in once all thumbnails have loaded to avoid a masonry layout flash. */
function populatePortfolioGallery(portfolio) {
    var gallery = document.querySelector('.masonry-gallery');
    if (!gallery) return;
    gallery.innerHTML = '';

    // Sizer element gives Masonry.js a stable column-width reference
    var sizer = document.createElement('div');
    sizer.className = 'gallery-sizer';
    gallery.appendChild(sizer);

    portfolio.forEach(function (photo) {
        var item = document.createElement('div');
        item.className = 'gallery-item';
        item.setAttribute('data-category', photo.category);
        // The thumbnail isn't requested yet: the gallery loads photos in small
        // batches, and only for the category on show (see GALLERY BATCH LOADING).
        // data-thumb keeps the address so the lightbox can open any photo.
        item.classList.add('pending');
        item.setAttribute('data-thumb', 'images/Thumb/' + photo.filename);
        var img = document.createElement('img');
        img.alt = photo.title;
        img.decoding = 'async';
        item.appendChild(img);
        gallery.appendChild(item);
    });

    // Masonry is initialised from initInteractivity() after the default filter runs.
}

/* Populate the three featured-item slots on index.html.
   Uses featured_images array from content.json for explicit ordering;
   falls back to featured: true flag if the array is absent. Empty slots are
   filled from `pool` (photos shown on the Portfolio page), never from hidden ones. */
function populateFeaturedImages(portfolio, featuredImages, pool) {
    pool = pool || portfolio;
    var grid = document.querySelector('.featured-grid');
    if (!grid) return;

    var byFilename = {};
    portfolio.forEach(function (p) { byFilename[p.filename] = p; });

    var featured;
    if (featuredImages && featuredImages.length) {
        featured = featuredImages.map(function (fn) { return byFilename[fn]; }).filter(Boolean);
        if (featured.length < 3) {
            pool.forEach(function (p) {
                if (featured.length < 3 && featuredImages.indexOf(p.filename) === -1) featured.push(p);
            });
        }
    } else {
        featured = portfolio.filter(function (p) { return p.featured; });
        if (featured.length < 3) {
            var extras = pool.filter(function (p) { return !p.featured; });
            var i = 0;
            while (featured.length < 3 && i < extras.length) featured.push(extras[i++]);
        }
    }

    grid.innerHTML = '';
    featured.slice(0, 3).forEach(function (photo) {
        var item = document.createElement('div');
        item.className = 'featured-item';
        var img = document.createElement('img');
        img.src = 'images/Thumb/' + photo.filename;
        img.alt = photo.title;
        item.appendChild(img);
        grid.appendChild(item);
    });
}

/* Build the portfolio filter buttons from the categories list in content.json.
   Leaves the hardcoded buttons in place if no categories are defined yet. The
   first category is shown active by default. Runs before initInteractivity so
   the buttons exist when their click handlers are attached. */
function populateCategories(categories) {
    var container = document.querySelector('.filter-buttons');
    if (!container || !categories || !categories.length) return;
    container.innerHTML = categories.map(function (cat, i) {
        return '<button class="category-btn' + (i === 0 ? ' active' : '') +
               '" data-category="' + esc(cat.key) + '">' + esc(cat.label) + '</button>';
    }).join('');
}

/* ----------------------------------------------------------
   SHARED BLOCK RENDERER
   Blog posts and projects use one content format: an array of
   blocks, each either { type: 'text', text } or
   { type: 'image', src, size, align }. Both render through these
   helpers so the two always look and behave the same way.
   ---------------------------------------------------------- */

/* Escape text before putting it into HTML. */
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* Blank-line-separated text becomes paragraphs; single newlines become <br>. */
function textToParas(text) {
    var out = '';
    (text || '').split(/\n\n+/).forEach(function (para) {
        if (para.trim()) out += '<p class="post-body">' + esc(para).replace(/\n/g, '<br>') + '</p>';
    });
    return out;
}

/* An image block. b.src is a full repo-relative path; older blog
   posts used b.filename (always in images/Blog/). */
function imageTag(b, alt) {
    var src = b.src || (b.filename ? 'images/Blog/' + b.filename : '');
    if (!src) return '';
    var cls = (b.size === 'full' || b.align === 'full')
        ? 'blog-image img-full'
        : 'blog-image img-' + (b.size || 'medium') + ' img-' + (b.align || 'center');
    return '<img class="' + cls + '" src="' + encodeURI(src) +
           '" alt="' + esc(alt) + '" loading="lazy">';
}

/* Old-style blog posts ({ body, images }) become blocks so both render the same way. */
function asBlocks(item) {
    if (item.blocks) return item.blocks;
    var blocks = [];
    (item.images || []).forEach(function (fn) {
        blocks.push({ type: 'image', filename: fn, size: 'full', align: 'full' });
    });
    if (item.body) blocks.push({ type: 'text', text: item.body });
    else if (item.excerpt) blocks.push({ type: 'text', text: item.excerpt });
    return blocks;
}

/* Render a block list to HTML. */
function blocksToHTML(blocks, alt) {
    var html = '';
    blocks.forEach(function (b) {
        if (b.type === 'text') html += textToParas(b.text);
        else if (b.type === 'image') html += imageTag(b, alt);
    });
    return html;
}

/* ----------------------------------------------------------
   LAYOUT RENDERER (posts and projects made in the layout editor)
   A post/project saved by the newer editor carries
   layout: { v: 2, width, gap, align, corners, cover } and its
   blocks gain a width in twelfths (w), an optional newRow that
   starts a fresh row, and per-type options:
     text    { text, style: body|heading|subheading|quote|small, align }
     image   { src, crop, caption, zoom }
     spacer  { size: s|m|l }      divider {}
     carousel { slides: [{ src, caption }], crop, fit, autoplay }
     gallery  { slides, cols }   compare { before, after, crop, labels }
     banner   { src, title, text, place, shade, crop }   button { label, href, look, align }
     (image may also have exif: true; body text may have dropcap: true)
   Each row is a wrapping flex line, so a row of 4-wide photos
   becomes a 3-up grid and an image beside text sits side by side.
   Tablets and phones adapt automatically, unless layout.custom
   gives them their own widths (block.tw / block.pw); hideD/T/P
   hide a block on laptops / tablets / phones.
   Anything without layout.v === 2 renders the old way above.
   ---------------------------------------------------------- */

var LAYOUT_PAGE_PX = { standard: 800, wide: 1100, full: 1400 };

function isLayoutV2(item) {
    return !!(item && item.layout && item.layout.v === 2);
}

/* **bold**, *italic* and [text](link) inside escaped text. Links may only be
   web, email, or on-site addresses. */
function inlineMarkup(s) {
    var h = esc(s);
    h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
        url = url.replace(/&amp;/g, '&');
        if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^(https?|mailto):/i.test(url)) return label;
        var ext = /^https?:/i.test(url) ? ' target="_blank" rel="noopener"' : '';
        return '<a href="' + esc(url) + '"' + ext + '>' + label + '</a>';
    });
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(^|[^*])\*([^*\s][^*\n]*)\*/g, '$1<em>$2</em>');
    return h;
}

function layText(b) {
    var text = b.text || '';
    var paras = text.split(/\n\s*\n/).filter(function (p) { return p.trim(); });
    var cls = 'lay-ta-' + (b.align || 'left');
    var inner = function (p) { return inlineMarkup(p.trim()).replace(/\n/g, '<br>'); };
    switch (b.style) {
        case 'heading':    return '<h2 class="lay-h2 ' + cls + '">' + inner(text) + '</h2>';
        case 'subheading': return '<h3 class="lay-h3 ' + cls + '">' + inner(text) + '</h3>';
        case 'quote':
            return '<blockquote class="lay-quote ' + cls + '">' +
                   paras.map(function (p) { return '<p>' + inner(p) + '</p>'; }).join('') + '</blockquote>';
        default:
            return '<div class="lay-text ' + cls + (b.style === 'small' ? ' lay-small' : '') + (b.dropcap ? ' lay-dropcap' : '') + '">' +
                   paras.map(function (p) { return '<p>' + inner(p) + '</p>'; }).join('') + '</div>';
    }
}

/* Library photos have a full-size twin; offer it for big or sharp screens. */
function layImage(b, alt, pagePx) {
    var src = b.src || (b.filename ? 'images/Blog/' + b.filename : '');
    if (!src) return '';
    var full = src.indexOf('images/Thumb/') === 0 ? src.replace('images/Thumb/', 'images/Full res/') : '';
    var px = Math.round(pagePx * (b.w || 12) / 12);
    var attrs = 'src="' + encodeURI(src) + '" alt="' + esc(b.caption || alt) + '" loading="lazy"';
    if (full) {
        attrs += ' srcset="' + encodeURI(src) + ' 1000w, ' + encodeURI(full) + ' 2400w"' +
                 ' sizes="(max-width: 700px) 100vw, ' + px + 'px"';
    }
    var zoom = b.zoom !== false;
    if (zoom) attrs += ' data-full="' + encodeURI(full || src) + '"';
    return '<figure class="lay-figure lay-crop-' + (b.crop || 'original') + (zoom ? ' lay-zoom' : '') + '">' +
               '<img ' + attrs + '>' +
               ((b.caption || b.exif) ? '<figcaption>' + (b.caption ? inlineMarkup(b.caption) : '') +
                   (b.exif && layExifLine(src) ? '<span class="lay-exif">' + layExifLine(src) + '</span>' : '') + '</figcaption>' : '') +
           '</figure>';
}

/* A carousel: one photo at a time, swipe or arrows, optional autoplay. */
function layCarousel(b, alt, pagePx) {
    var slides = (b.slides || []).filter(function (s) { return s.src; });
    if (!slides.length) return '';
    var html = '<div class="lay-car lay-crop-' + (b.crop || 'landscape') + (b.fit === 'contain' ? ' lay-fit-contain' : '') + '"' +
               (b.autoplay ? ' data-autoplay="1"' : '') + '>' +
               '<div class="lay-car-track">' +
               slides.map(function (s) {
                   return '<div class="lay-car-slide">' + layImage({ src: s.src, caption: s.caption, w: b.w, crop: b.crop || 'landscape' }, alt, pagePx) + '</div>';
               }).join('') + '</div>';
    if (slides.length > 1) {
        html += '<button class="lay-car-btn lay-car-prev" aria-label="Previous photo">&#8249;</button>' +
                '<button class="lay-car-btn lay-car-next" aria-label="Next photo">&#8250;</button>' +
                '<div class="lay-car-dots">' + slides.map(function (s, i) {
                    return '<button aria-label="Photo ' + (i + 1) + '"' + (i === 0 ? ' class="on"' : '') + '></button>';
                }).join('') + '</div>';
    }
    return html + '</div>';
}

function initCarousels() {
    document.querySelectorAll('.lay-car').forEach(function (car) {
        var track = car.querySelector('.lay-car-track');
        var slides = track.children, dots = car.querySelectorAll('.lay-car-dots button');
        if (slides.length < 2) return;
        var at = 0, timer = null;
        function go(i) {
            at = (i + slides.length) % slides.length;
            track.scrollTo({ left: slides[at].offsetLeft, behavior: 'smooth' });
        }
        track.addEventListener('scroll', function () {
            var i = Math.round(track.scrollLeft / track.clientWidth);
            if (i !== at && i >= 0 && i < slides.length) at = i;
            dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
        }, { passive: true });
        car.querySelector('.lay-car-prev').addEventListener('click', function () { stop(); go(at - 1); });
        car.querySelector('.lay-car-next').addEventListener('click', function () { stop(); go(at + 1); });
        dots.forEach(function (d, k) { d.addEventListener('click', function () { stop(); go(k); }); });
        function stop() { if (timer) { clearInterval(timer); timer = null; } }
        if (car.getAttribute('data-autoplay') && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
            timer = setInterval(function () { go(at + 1); }, 5000);
            car.addEventListener('pointerenter', stop);
            track.addEventListener('touchstart', stop, { passive: true });
        }
    });
}

/* Only web, email and on-site links are allowed in buttons. */
function laySafeHref(url) {
    url = String(url || '').trim();
    if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^(https?|mailto|tel):/i.test(url)) return '';
    return url;
}

/* "OM System OM-5 · 300mm · f/5.6 · 1/1000s · ISO 200" for a library photo. */
function layExifLine(src) {
    var p = photoData[(src || '').split('/').pop()];
    if (!p) return '';
    var shutter = p.shutter ? (String(p.shutter).slice(-1) === 's' ? p.shutter : p.shutter + 's') : '';
    return [p.camera, p.focal, p.aperture, shutter, p.iso ? 'ISO ' + p.iso : ''].filter(Boolean).join(' &middot; ');
}

function layGallery(b, alt, pagePx) {
    var slides = (b.slides || []).filter(function (s) { return s.src; });
    if (!slides.length) return '';
    var cols = Math.max(2, Math.min(4, b.cols || 3));
    var colPx = pagePx * (b.w || 12) / 12 / cols;
    return '<div class="lay-gal" style="--cols:' + cols + '">' + slides.map(function (s) {
        return layImage({ src: s.src, caption: s.caption, w: Math.max(1, Math.round(12 * colPx / pagePx)) }, alt, pagePx);
    }).join('') + '</div>';
}

function layCompare(b, alt) {
    var before = b.before && b.before.src, after = b.after && b.after.src;
    if (!before || !after) return '';
    return '<div class="lay-cmp lay-crop-' + (b.crop || 'landscape') + '" style="--pos:50%">' +
               '<img class="lay-cmp-img" src="' + encodeURI(after) + '" alt="' + esc((b.afterLabel || 'After') + ' – ' + alt) + '" loading="lazy">' +
               '<div class="lay-cmp-before"><img class="lay-cmp-img" src="' + encodeURI(before) + '" alt="' + esc((b.beforeLabel || 'Before') + ' – ' + alt) + '" loading="lazy"></div>' +
               '<div class="lay-cmp-line" aria-hidden="true"><span>&#8249;&#8250;</span></div>' +
               '<span class="lay-cmp-label lay-cmp-l">' + esc(b.beforeLabel || 'Before') + '</span>' +
               '<span class="lay-cmp-label lay-cmp-r">' + esc(b.afterLabel || 'After') + '</span>' +
               '<input class="lay-cmp-range" type="range" min="0" max="100" value="50" aria-label="Slide to compare ' +
                   esc(b.beforeLabel || 'before') + ' and ' + esc(b.afterLabel || 'after') + '">' +
           '</div>';
}

function layBanner(b, alt, pagePx) {
    if (!b.src) return '';
    var full = b.src.indexOf('images/Thumb/') === 0 ? b.src.replace('images/Thumb/', 'images/Full res/') : '';
    var shade = Math.max(0, Math.min(0.8, parseFloat(b.shade == null ? 0.35 : b.shade) || 0));
    return '<div class="lay-bnr lay-crop-' + (b.crop || 'wide') + ' lay-bn-' + (b.place || 'center') + '" style="--shade:' + shade + '">' +
               '<img src="' + encodeURI(b.src) + '"' +
                   (full ? ' srcset="' + encodeURI(b.src) + ' 1000w, ' + encodeURI(full) + ' 2400w" sizes="(max-width: 700px) 100vw, ' + Math.round(pagePx * (b.w || 12) / 12) + 'px"' : '') +
                   ' alt="' + esc(b.title || alt) + '" loading="lazy">' +
               '<div class="lay-bn-text">' +
                   (b.title ? '<h2 class="lay-bn-title">' + inlineMarkup(b.title) + '</h2>' : '') +
                   (b.text ? '<p class="lay-bn-sub">' + inlineMarkup(b.text) + '</p>' : '') +
               '</div>' +
           '</div>';
}

function layButton(b) {
    var href = laySafeHref(b.href);
    if (!b.label || !href) return '';
    var ext = /^https?:/i.test(href) ? ' target="_blank" rel="noopener"' : '';
    return '<div class="lay-btnwrap lay-ta-' + (b.align || 'center') + '"><a class="lay-btn lay-btn-' + (b.look === 'outline' ? 'outline' : 'solid') +
           '" href="' + esc(href) + '"' + ext + '>' + esc(b.label) + '</a></div>';
}

/* Before/after sliders: the range input sits over the photos, so dragging,
   tapping and the keyboard all move the dividing line. */
function initCompares() {
    document.querySelectorAll('.lay-cmp').forEach(function (c) {
        var r = c.querySelector('.lay-cmp-range');
        var set = function () { c.style.setProperty('--pos', r.value + '%'); };
        r.addEventListener('input', set);
        set();
    });
}

/* Split the block list into rows: a block with newRow starts a new one. */
function layoutRows(blocks) {
    var rows = [];
    (blocks || []).forEach(function (b, i) {
        if (i === 0 || b.newRow) rows.push([]);
        rows[rows.length - 1].push(b);
    });
    return rows;
}

function layoutToHTML(item, alt) {
    var L = item.layout || {};
    var width = LAYOUT_PAGE_PX[L.width] ? L.width : 'standard';
    var pagePx = LAYOUT_PAGE_PX[width];
    var custom = L.custom || {};
    var html = '<div class="lay-page lay-w-' + width + ' lay-gap-' + (L.gap || 'normal') +
               (L.corners === 'square' ? ' lay-square' : '') +
               (custom.tablet ? ' lay-custom-t' : '') + (custom.phone ? ' lay-custom-p' : '') + '">';
    layoutRows(item.blocks).forEach(function (row) {
        html += '<div class="lay-row lay-row-' + (L.align === 'left' ? 'left' : 'center') + '">';
        row.forEach(function (b) {
            var w = Math.max(1, Math.min(12, parseInt(b.w, 10) || 12));
            var inner = '';
            if (b.type === 'text') inner = layText(b);
            else if (b.type === 'image') inner = layImage(b, alt, pagePx);
            else if (b.type === 'spacer') inner = '<div class="lay-spacer lay-sp-' + (b.size || 'm') + '"></div>';
            else if (b.type === 'divider') inner = '<hr class="lay-divider">';
            else if (b.type === 'carousel') inner = layCarousel(b, alt, pagePx);
            else if (b.type === 'gallery') inner = layGallery(b, alt, pagePx);
            else if (b.type === 'compare') inner = layCompare(b, alt);
            else if (b.type === 'banner') inner = layBanner(b, alt, pagePx);
            else if (b.type === 'button') inner = layButton(b);
            if (!inner) return;
            // tw / pw: widths on tablets / phones, used only when that size has
            // its own layout (layout.custom); otherwise those sizes adapt by themselves.
            var style = '--w:' + w;
            if (custom.tablet && b.tw) style += ';--wt:' + b.tw;
            if (custom.phone && b.pw) style += ';--wp:' + b.pw;
            html += '<div class="lay-cell lay-k-' + b.type + ' lay-v-' + (b.valign || 'top') +
                    (b.type === 'image' && w <= 4 ? ' lay-narrow' : '') +
                    (b.hideD ? ' lay-hide-d' : '') + (b.hideT ? ' lay-hide-t' : '') + (b.hideP ? ' lay-hide-p' : '') +
                    '" style="' + style + '">' + inner + '</div>';
        });
        html += '</div>';
    });
    return html + '</div>';
}

/* Either renderer, whichever the item was saved with. */
function itemBodyHTML(item, alt) {
    return isLayoutV2(item) ? layoutToHTML(item, alt) : blocksToHTML(asBlocks(item), alt);
}

/* Click a photo in a post or project to see it large; arrows/keys step
   through that page's photos. Built on demand so pages without one pay nothing. */
function initLayoutViewer() {
    var figs = document.querySelectorAll('.lay-zoom img');
    if (!figs.length) return;
    var viewer = null, list = [], at = 0;

    function show(i) {
        at = (i + list.length) % list.length;
        var img = list[at];
        viewer.querySelector('img').src = img.getAttribute('data-full');
        var cap = img.parentNode.querySelector('figcaption');
        viewer.querySelector('.lay-viewer-cap').innerHTML = cap ? cap.innerHTML : '';
    }
    function close() { viewer.classList.remove('active'); document.body.style.overflow = ''; }
    function build() {
        viewer = document.createElement('div');
        viewer.className = 'lay-viewer';
        viewer.innerHTML = '<button class="lay-viewer-close" aria-label="Close">&times;</button>' +
            '<button class="lay-viewer-prev" aria-label="Previous">&#8249;</button>' +
            '<figure><img alt=""><figcaption class="lay-viewer-cap"></figcaption></figure>' +
            '<button class="lay-viewer-next" aria-label="Next">&#8250;</button>';
        document.body.appendChild(viewer);
        viewer.addEventListener('click', function (e) { if (e.target === viewer) close(); });
        viewer.querySelector('.lay-viewer-close').addEventListener('click', close);
        viewer.querySelector('.lay-viewer-prev').addEventListener('click', function () { show(at - 1); });
        viewer.querySelector('.lay-viewer-next').addEventListener('click', function () { show(at + 1); });
        document.addEventListener('keydown', function (e) {
            if (!viewer.classList.contains('active')) return;
            if (e.key === 'Escape') close();
            else if (e.key === 'ArrowLeft') show(at - 1);
            else if (e.key === 'ArrowRight') show(at + 1);
        });
    }
    Array.prototype.forEach.call(figs, function (img) {
        img.addEventListener('click', function () {
            if (!viewer) build();
            // Step through the photos of this one post/project only.
            var page = img.closest('.lay-page');
            list = Array.prototype.slice.call(page.querySelectorAll('.lay-zoom img')).filter(function (el) {
                return el.offsetParent !== null;   // skip photos hidden at this screen size
            });
            var multi = list.length > 1;
            viewer.querySelector('.lay-viewer-prev').style.display = multi ? '' : 'none';
            viewer.querySelector('.lay-viewer-next').style.display = multi ? '' : 'none';
            show(list.indexOf(img));
            viewer.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    });
}

/* Build blog post list on blog.html from the blog array in content.json.
   Renders nothing if the array is empty. */
function populateBlog(blog) {
    var container = document.querySelector('.blog-posts');
    if (!container) return;
    container.innerHTML = '';
    if (!blog || blog.length === 0) return;

    /* Drafts stay hidden unless the Site Manager opened ?preview=1. */
    var preview = urlParam('preview') === '1';
    blog = blog.filter(function (post) { return preview || post.status !== 'draft'; });

    blog.forEach(function (post) {
        var article = document.createElement('article');
        article.className = 'blog-post';

        var html = '<h2>' + esc(post.title) + '</h2>';
        if (post.status === 'draft') html += '<span class="blog-draft-note">Draft: only visible in preview</span>';
        if (post.date) html += '<span class="blog-date">' + esc(post.date) + '</span>';
        html += itemBodyHTML(post, post.title);

        article.innerHTML = html;
        container.appendChild(article);
    });
}


/* ----------------------------------------------------------
   PROJECTS
   projects.html lists the projects; project.html renders whichever
   one the ?p= slug in the URL names. Both read the same projects
   array from content.json, so adding a project never needs a new
   HTML file — only a content change from the Site Manager.
   ---------------------------------------------------------- */

/* A project cover or image: a bare filename means an existing portfolio
   photo (images/Thumb/), anything containing a slash is a full path. */
function projectImageSrc(name) {
    if (!name) return '';
    return name.indexOf('/') === -1 ? 'images/Thumb/' + name : name;
}

/* Every published project has its own page at /project/<slug>/, written by the
   Site Manager. Drafts have no page and are previewed through project.html. */
function projectUrl(slug) {
    return '/project/' + encodeURIComponent(slug || '') + '/';
}

/* Drafts are hidden from the live site. A project with no status is published,
   so projects added by hand still show. */
function isPublished(project) {
    return project && project.status !== 'draft';
}

/* Read a query-string value: ?p= names which project to show, and
   ?preview=1 lets a draft through so it can be checked before publishing. */
function urlParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
}

/* Card grid on projects.html. */
function populateProjectsList(projects) {
    var grid = document.querySelector('.projects-grid');
    if (!grid) return;

    var live = (projects || []).filter(isPublished);
    if (!live.length) {
        grid.innerHTML = '<p class="projects-empty">No projects published yet &mdash; check back soon.</p>';
        return;
    }

    // A lone project would otherwise stretch the full width of the page.
    grid.classList.toggle('single', live.length === 1);

    grid.innerHTML = live.map(function (p) {
        var cover = projectImageSrc(p.cover);
        var media = cover
            ? '<img src="' + encodeURI(cover) + '" alt="' + esc(p.title) + '" loading="lazy">'
            : '<span class="project-card-nocover"></span>';
        // The whole card is one link, so the photo and the name below it both
        // open the project and it stays a single stop for keyboard users.
        return '<a class="project-card" href="' + projectUrl(p.slug) + '">' +
                   '<span class="project-card-media">' + media +
                       '<span class="project-card-hover"><span>Click here for more</span></span>' +
                   '</span>' +
                   '<span class="project-card-body">' +
                       '<span class="project-card-title">' + esc(p.title) + '</span>' +
                       (p.subtitle ? '<span class="project-card-sub">' + esc(p.subtitle) + '</span>' : '') +
                   '</span>' +
               '</a>';
    }).join('');
}

/* The single-project page. */
function populateProjectDetail(projects) {
    var holder = document.querySelector('.project-detail');
    if (!holder) return;

    // A generated project page carries its slug in data-project. project.html is
    // the preview/fallback renderer and takes it from ?p= instead.
    var slug = holder.getAttribute('data-project') || urlParam('p');
    var preview = urlParam('preview') === '1';
    var project = (projects || []).filter(function (p) {
        return p.slug === slug && (isPublished(p) || preview);
    })[0];

    if (!project) {
        showProjectMissing(holder);
        return;
    }

    document.title = project.title + ' | Stoneman Photography';
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) {
        canonical.setAttribute('href',
            'https://stonemanphotography.co.uk' + projectUrl(project.slug));
    }

    var html = '';
    if (!isPublished(project)) {
        html += '<p class="project-draft-note">Draft preview &mdash; this project is not visible on the site yet.</p>';
    }
    html += '<header class="project-head">' +
                '<h1>' + esc(project.title) + '</h1>' +
                (project.subtitle ? '<p class="page-header-sub">' + esc(project.subtitle) + '</p>' : '') +
            '</header>';

    var cover = projectImageSrc(project.cover);
    // The layout editor can turn the cover off at the top of the page (it
    // still shows on the Projects page card).
    if (cover && !(isLayoutV2(project) && project.layout.cover === false)) {
        html += '<img class="project-cover" src="' + encodeURI(cover) +
                '" alt="' + esc(project.title) + '">';
    }

    html += '<div class="project-body blog-post">' +
                itemBodyHTML(project, project.title) +
            '</div>';
    html += '<p class="project-back"><a href="/projects.html">&#8249; All projects</a></p>';

    holder.innerHTML = html;
}

/* Shown when the ?p= slug matches nothing — a mistyped or retired link. */
function showProjectMissing(holder) {
    document.title = 'Project not found | Stoneman Photography';
    holder.innerHTML =
        '<header class="project-head"><h1>Project not found</h1></header>' +
        '<p class="project-body post-body">That project does not exist, or it may have been taken down.</p>' +
        '<p class="project-back"><a href="/projects.html">&#8249; All projects</a></p>';
}

/* content.json could not be loaded (offline, or opened over file://).
   Only the project pages need this — every other page has hardcoded fallback content. */
function projectsUnavailable() {
    var msg = 'Projects could not be loaded. Please refresh the page.';
    var grid = document.querySelector('.projects-grid');
    if (grid) grid.innerHTML = '<p class="projects-empty">' + msg + '</p>';
    var holder = document.querySelector('.project-detail');
    if (holder) {
        holder.innerHTML = '<header class="project-head"><h1>Projects</h1></header>' +
            '<p class="project-body post-body">' + msg + '</p>' +
            '<p class="project-back"><a href="/projects.html">&#8249; All projects</a></p>';
    }
}


/* ----------------------------------------------------------
   SECTIONS 1–6 — INTERACTIVE FEATURES
   Runs after content has been populated so that event
   listeners are attached to the correct final DOM state.
   ---------------------------------------------------------- */

function initInteractivity() {


    // ==============================================
    // 1. MOBILE MENU TOGGLE
    // Opens and closes the navigation on small screens.
    // ==============================================

    var menuToggle = document.querySelector('.menu-toggle');
    var navLinks = document.querySelector('.nav-links');

    // When the hamburger button is clicked, show/hide the menu
    if (menuToggle && navLinks) {
        menuToggle.addEventListener('click', function (event) {
            // Stop the click from bubbling up to the document listener below
            event.stopPropagation();
            navLinks.classList.toggle('active');

            // Update the button icon: show X when open, hamburger when closed
            if (navLinks.classList.contains('active')) {
                menuToggle.textContent = '✕'; // X symbol
                menuToggle.setAttribute('aria-expanded', 'true');
            } else {
                menuToggle.textContent = '☰'; // Hamburger symbol
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });

        // Close the menu when clicking anywhere else on the page
        document.addEventListener('click', function (event) {
            // Only close if the menu is open and the click was outside it
            if (navLinks.classList.contains('active') &&
                !navLinks.contains(event.target) &&
                !menuToggle.contains(event.target)) {
                navLinks.classList.remove('active');
                menuToggle.textContent = '☰';
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });

        // Close the menu when a link inside it is clicked
        navLinks.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () {
                navLinks.classList.remove('active');
                menuToggle.textContent = '☰';
                menuToggle.setAttribute('aria-expanded', 'false');
            });
        });
    }


    // ==============================================
    // 2. ACTIVE PAGE HIGHLIGHT
    // Adds an "active" class to the current page's
    // link in the navigation bar.
    // ==============================================

    // Get the current page filename from the URL
    var currentPath = window.location.pathname;
    var currentPage = currentPath.split('/').pop();

    // If we're at the root with no filename, it's the home page
    if (currentPage === '' || currentPage === '/') {
        currentPage = 'index.html';
    }

    // A project page is /project/<slug>/, which ends in a slash and would
    // otherwise look like the home page. Both it and the preview renderer
    // should light up the Projects link.
    if (currentPage === 'project.html' || /\/project\/[^/]+\/?$/.test(currentPath)) {
        currentPage = 'projects.html';
    }

    // Find all nav links and mark the one that matches the current page
    var allNavLinks = document.querySelectorAll('.nav-links a');
    allNavLinks.forEach(function (link) {
        var linkPage = link.getAttribute('href');
        if (linkPage === currentPage) {
            link.classList.add('active');
        }
    });


    // ==============================================
    // 3. PORTFOLIO CATEGORY FILTER
    // Shows/hides gallery items based on which
    // category button is clicked. CSS-columns
    // masonry reflows automatically when items
    // are hidden/shown via display: none.
    // ==============================================

    var categoryButtons = document.querySelectorAll('.category-btn');
    var galleryItems = document.querySelectorAll('.gallery-item');

    categoryButtons.forEach(function (button) {
        button.addEventListener('click', function () {

            // Remove "active" class from all buttons
            categoryButtons.forEach(function (btn) {
                btn.classList.remove('active');
            });

            // Add "active" class to the clicked button
            button.classList.add('active');

            // Get the category to filter by (from the data-category attribute)
            var filterCategory = button.getAttribute('data-category');

            // Loop through all gallery items and show/hide them
            galleryItems.forEach(function (item) {
                var itemCategory = item.getAttribute('data-category');

                if (itemCategory === filterCategory) {
                    item.classList.remove('hidden');
                } else {
                    item.classList.add('hidden');
                }
            });

            // Re-lay out Masonry in place so it only places visible items.
            // reloadItems() re-runs the ':not(.hidden)' item selector; we never
            // destroy Masonry, because that collapses the gallery for a moment
            // and can throw the page back to the top.
            if (msnry) {
                msnry.reloadItems();
                msnry.layout();
            }
            if (galleryLoader) galleryLoader.start();
        });
    });

    // Apply the default active filter on page load (e.g. Wildlife first)
    var activeFilter = document.querySelector('.category-btn.active');
    if (activeFilter && galleryItems.length > 0) {
        var defaultCategory = activeFilter.getAttribute('data-category');
        galleryItems.forEach(function (item) {
            var itemCategory = item.getAttribute('data-category');
            if (itemCategory !== defaultCategory) {
                item.classList.add('hidden');
            }
        });
    }

    // Initialise Masonry now that the default filter has been applied.
    // Column width is calculated directly from clientWidth minus padding so
    // there is no ambiguity about what "100%" resolves to for abs-positioned
    // items vs normal-flow items (the root cause of the one-column bug).
    var msnryGallery = document.querySelector('.masonry-gallery');
    if (msnryGallery && typeof Masonry !== 'undefined') {

        function calcColWidth() {
            var cs  = window.getComputedStyle(msnryGallery);
            var inner = msnryGallery.clientWidth
                - parseFloat(cs.paddingLeft)
                - parseFloat(cs.paddingRight);
            var cols = window.innerWidth > 1199 ? 3
                     : window.innerWidth > 767  ? 2
                     : 1;
            return Math.floor((inner - 14 * (cols - 1)) / cols);
        }

        function applyColWidth(colW) {
            // Set every item's width to the computed pixel value so it matches
            // Masonry's column width regardless of how CSS resolves percentages.
            Array.prototype.forEach.call(
                msnryGallery.querySelectorAll('.gallery-item'),
                function (item) { item.style.width = colW + 'px'; }
            );
        }

        requestAnimationFrame(function () {
            var colW = calcColWidth();
            applyColWidth(colW);

            msnry = new Masonry(msnryGallery, {
                itemSelector: '.gallery-item:not(.hidden):not(.pending)',
                columnWidth: colW,
                gutter: 14,
                horizontalOrder: false,   // fill the shortest column, so columns stay balanced (admin Arrange view mirrors this)
                transitionDuration: 0
            });

            // GALLERY BATCH LOADING
            // Thumbnails load a batch at a time, and only for the category on
            // show: the first batch straight away, the next ones as the visitor
            // scrolls near the bottom of the gallery. Each batch stays hidden
            // until its photos have loaded, then joins the layout in one go, so
            // nothing jumps. Masonry fills the shortest column in order, so the
            // final arrangement is the same as loading everything at once.
            var BATCH = 12;
            var busy = false;

            // Start the next batch while the visitor is still several screens
            // away, so it is usually ready before they scroll to it.
            function nearBottom() {
                var r = msnryGallery.getBoundingClientRect();
                return r.bottom < window.innerHeight * 4;
            }

            function loadBatch() {
                if (busy) return;
                var batch = Array.prototype.slice.call(
                    msnryGallery.querySelectorAll('.gallery-item.pending:not(.hidden)'), 0, BATCH);
                if (!batch.length) return;
                busy = true;
                // While the category on show has no photos yet, the gallery keeps a
                // full screen of height so the text below doesn't jump up and back.
                if (!msnryGallery.querySelector('.gallery-item:not(.hidden):not(.pending)')) {
                    msnryGallery.classList.remove('has-photos');
                }
                batch.forEach(function (item) {
                    item.querySelector('img').src = item.getAttribute('data-thumb');
                });
                msnryGallery.style.opacity = '1';
                imagesLoaded(batch, function () {
                    // Every batch, the first included, arrives transparent and
                    // fades in all together.
                    batch.forEach(function (item) {
                        item.classList.remove('pending');
                        item.classList.add('arriving');
                    });
                    if (msnry) { msnry.reloadItems(); msnry.layout(); }
                    msnryGallery.classList.add('has-photos');
                    // Two rAFs: let the browser paint the photos (transparent) in
                    // their Masonry positions first, then start the fade.
                    requestAnimationFrame(function () {
                        requestAnimationFrame(function () {
                            batch.forEach(function (item) { item.classList.remove('arriving'); });
                        });
                    });
                    busy = false;
                    if (nearBottom()) loadBatch();
                });
            }

            galleryLoader = { start: loadBatch };
            loadBatch();

            var scrollQueued = false;
            window.addEventListener('scroll', function () {
                if (scrollQueued) return;
                scrollQueued = true;
                requestAnimationFrame(function () {
                    scrollQueued = false;
                    if (nearBottom()) loadBatch();
                });
            }, { passive: true });

            // Keep column count and item widths in sync on resize.
            // Mobile browsers fire 'resize' when the address bar hides/shows
            // while scrolling (height-only), so ignore events where the width
            // hasn't changed, debounce the rest, and update Masonry in place
            // rather than destroying it (destroy collapses the gallery and
            // resets the scroll position to the top).
            var lastWidth = window.innerWidth;
            var resizeTimer = null;
            window.addEventListener('resize', function () {
                if (window.innerWidth === lastWidth) return;
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(function () {
                    if (window.innerWidth === lastWidth) return;
                    lastWidth = window.innerWidth;
                    var newColW = calcColWidth();
                    applyColWidth(newColW);
                    if (msnry) {
                        msnry.options.columnWidth = newColW;
                        msnry.layout();
                    }
                }, 150);
            });
        });
    }


    // ==============================================
    // 4. LIGHTBOX WITH EXIF METADATA
    // Click a gallery or featured image to view it
    // large with photo title and camera settings.
    // Works on both the portfolio and home pages.
    // ==============================================

    var lightbox = document.querySelector('.lightbox');
    var lightboxContent = document.querySelector('.lightbox-content');
    var lightboxClose = document.querySelector('.lightbox-close');
    var lightboxPrev = document.querySelector('.lightbox-prev');
    var lightboxNext = document.querySelector('.lightbox-next');

    var currentLightboxIndex = -1;

    // Helper: extract the filename from an image src path
    function getFilename(src) {
        return decodeURIComponent(src.split('/').pop().split('?')[0]);
    }

    // Helper: get the full-resolution image URL from a thumbnail URL
    function getFullResUrl(thumbSrc) {
        return thumbSrc.replace('images/Thumb/', 'images/Full%20res/');
    }

    // Helper: build the metadata HTML for a given filename
    function buildMetaHTML(filename) {
        var data = photoData[filename];
        if (!data) return '';

        var html = '';

        // Photo title
        html += '<div class="lightbox-title">' + data.title + '</div>';

        // Metadata bar
        html += '<div class="lightbox-meta">';
        html += '<div class="meta-item"><span class="meta-label">Camera</span><span class="meta-value">' + data.camera + '</span></div>';
        html += '<div class="meta-item"><span class="meta-label">Lens</span><span class="meta-value">' + data.lens + '</span></div>';
        html += '<div class="meta-item"><span class="meta-label">Focal</span><span class="meta-value">' + data.focal + '</span></div>';
        html += '<div class="meta-item"><span class="meta-label">Shutter</span><span class="meta-value">' + data.shutter + '</span></div>';
        html += '<div class="meta-item"><span class="meta-label">Aperture</span><span class="meta-value">' + data.aperture + '</span></div>';
        html += '<div class="meta-item"><span class="meta-label">ISO</span><span class="meta-value">' + data.iso + '</span></div>';
        html += '<div class="meta-item"><span class="meta-label">Date</span><span class="meta-value">' + data.date + '</span></div>';
        html += '</div>';

        return html;
    }

    // Fine Art print shapes offered on the Prints page. 'r' is the long edge
    // divided by the short edge. Keep in step with the Prints page groups.
    var PRINT_RATIOS = [
        { label: '1:1 (square)',     r: 1 },
        { label: '4:3',              r: 4 / 3 },
        { label: 'A size',           r: Math.SQRT2 },
        { label: '3:2',              r: 3 / 2 },
        { label: '2:1 (panoramic)',  r: 2 },
        { label: '3:1 (panoramic)',  r: 3 }
    ];

    // Given an image's pixel size, return the closest print ratio as text,
    // e.g. "3:2 landscape". Worked out from the photo itself, so new photos
    // need no extra setup.
    function closestPrintRatio(width, height) {
        if (!width || !height) return '';
        var r = Math.max(width, height) / Math.min(width, height);
        var best = PRINT_RATIOS[0];
        for (var i = 1; i < PRINT_RATIOS.length; i++) {
            // Compare on a log scale so 'twice as wide' and 'half as wide' weigh the same
            if (Math.abs(Math.log(r / PRINT_RATIOS[i].r)) < Math.abs(Math.log(r / best.r))) {
                best = PRINT_RATIOS[i];
            }
        }
        if (best.r === 1) return best.label;
        return best.label + (width > height ? ' landscape' : ' portrait');
    }

    // Add the "Print ratio" item to the metadata bar (creating the bar if the
    // photo has no camera details)
    function addPrintRatio(width, height) {
        var text = closestPrintRatio(width, height);
        if (!text) return;
        var meta = lightboxContent.querySelector('.lightbox-meta');
        if (!meta) {
            meta = document.createElement('div');
            meta.className = 'lightbox-meta';
            lightboxContent.appendChild(meta);
        }
        var item = document.createElement('div');
        item.className = 'meta-item';
        item.innerHTML = '<span class="meta-label">Print ratio</span><span class="meta-value"></span>';
        item.lastChild.textContent = text;
        meta.appendChild(item);
    }

    // Returns the items to cycle through in the lightbox.
    // On portfolio page: visible gallery items (respects active filter).
    // On home page: featured items (no gallery items present).
    function getVisibleItems() {
        var items = Array.prototype.slice.call(
            document.querySelectorAll('.gallery-item:not(.hidden)')
        );
        if (!items.length) {
            items = Array.prototype.slice.call(document.querySelectorAll('.featured-item'));
        }
        return items;
    }

    // Open the lightbox for a specific index within the visible items
    function openLightboxAtIndex(index) {
        var items = getVisibleItems();
        if (!items.length) return;

        // Clamp and wrap index
        index = ((index % items.length) + items.length) % items.length;
        currentLightboxIndex = index;

        var img = items[index].querySelector('img');
        if (!lightbox || !lightboxContent || !img) return;

        // Portfolio photos that haven't loaded yet carry their address in data-thumb.
        var thumb = items[index].getAttribute('data-thumb');
        var thumbSrc = thumb ? new URL(thumb, window.location.href).href : img.src;
        var filename = getFilename(thumbSrc);
        var fullResSrc = getFullResUrl(thumbSrc);

        // Show/hide arrows: hide if only one image is visible
        if (lightboxPrev) lightboxPrev.style.display = items.length > 1 ? '' : 'none';
        if (lightboxNext) lightboxNext.style.display = items.length > 1 ? '' : 'none';

        // Hide instantly (no transition) to avoid flashing previous content
        lightboxContent.style.transition = 'none';
        lightboxContent.style.opacity = '0';

        // No <img> in the DOM yet — avoids the broken-image icon while loading
        lightboxContent.innerHTML = buildMetaHTML(filename);

        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Load full res off-screen; once ready, insert the image and fade everything in.
        // onerror: full-res unavailable — still reveal EXIF so the lightbox isn't blank.
        var fullImg = new Image();
        fullImg.onload = function () {
            var imgEl = document.createElement('img');
            imgEl.src = fullResSrc;
            imgEl.alt = img.alt || '';
            lightboxContent.insertBefore(imgEl, lightboxContent.firstChild);
            addPrintRatio(fullImg.naturalWidth, fullImg.naturalHeight);
            lightboxContent.style.transition = 'opacity 0.4s ease';
            lightboxContent.style.opacity = '1';
        };
        fullImg.onerror = function () {
            lightboxContent.style.transition = 'opacity 0.4s ease';
            lightboxContent.style.opacity = '1';
        };
        fullImg.src = fullResSrc;
    }

    // Shared function: open the lightbox for a given image element
    function openLightbox(img) {
        var items = getVisibleItems();
        var index = 0;
        for (var i = 0; i < items.length; i++) {
            if (items[i].querySelector('img') === img) { index = i; break; }
        }
        openLightboxAtIndex(index);
    }

    // Attach click handlers to gallery items (portfolio page)
    galleryItems.forEach(function (item) {
        item.addEventListener('click', function () {
            var img = item.querySelector('img');
            if (img) {
                openLightbox(img);
            }
        });
    });

    // Attach click handlers to featured items (home page)
    var featuredItems = document.querySelectorAll('.featured-item');
    featuredItems.forEach(function (item) {
        item.addEventListener('click', function () {
            var img = item.querySelector('img');
            if (img) {
                openLightbox(img);
            }
        });
    });

    // Close the lightbox (shared function used by multiple triggers)
    function closeLightbox() {
        if (!lightbox) return;
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Close when clicking the X button
    if (lightboxClose) {
        lightboxClose.addEventListener('click', closeLightbox);
    }

    // Close when clicking outside the image (on the dark overlay)
    if (lightbox) {
        lightbox.addEventListener('click', function (event) {
            // Only close if the click was on the overlay, not the content
            if (event.target === lightbox) {
                closeLightbox();
            }
        });
    }

    // Arrow buttons
    if (lightboxPrev) {
        lightboxPrev.addEventListener('click', function (event) {
            event.stopPropagation();
            openLightboxAtIndex(currentLightboxIndex - 1);
        });
    }
    if (lightboxNext) {
        lightboxNext.addEventListener('click', function (event) {
            event.stopPropagation();
            openLightboxAtIndex(currentLightboxIndex + 1);
        });
    }

    // Keyboard: Escape closes, left/right arrows navigate
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') { closeLightbox(); }
        if (!lightbox || !lightbox.classList.contains('active')) return;
        if (event.key === 'ArrowLeft')  { openLightboxAtIndex(currentLightboxIndex - 1); }
        if (event.key === 'ArrowRight') { openLightboxAtIndex(currentLightboxIndex + 1); }
    });


    // ==============================================
    // 5. CONTACT FORM VALIDATION
    // Checks that all required fields are filled in
    // before allowing the form to submit to Formspree.
    // ==============================================

    var contactForm = document.querySelector('.contact-form');

    if (contactForm) {
        contactForm.addEventListener('submit', function (event) {

            // Get the form field values
            var nameField = contactForm.querySelector('#name');
            var emailField = contactForm.querySelector('#email');
            var messageField = contactForm.querySelector('#message');

            // Track whether all fields are valid
            var isValid = true;

            // --- Validate Name ---
            if (nameField.value.trim() === '') {
                showError(nameField, 'Please enter your name.');
                isValid = false;
            } else {
                clearError(nameField);
            }

            // --- Validate Email ---
            if (emailField.value.trim() === '') {
                showError(emailField, 'Please enter your email address.');
                isValid = false;
            } else if (!isValidEmail(emailField.value.trim())) {
                showError(emailField, 'Please enter a valid email address.');
                isValid = false;
            } else {
                clearError(emailField);
            }

            // --- Validate Message ---
            if (messageField.value.trim() === '') {
                showError(messageField, 'Please enter a message.');
                isValid = false;
            } else {
                clearError(messageField);
            }

            // If any field is invalid, stop the submission so errors are visible
            if (!isValid) {
                event.preventDefault();
            }
        });
    }

    // Helper: show an error message below a form field
    function showError(field, message) {
        field.classList.add('error');
        var errorDiv = field.parentElement.querySelector('.error-message');
        if (errorDiv) {
            errorDiv.textContent = message;
            errorDiv.style.display = 'block';
        }
    }

    // Helper: clear an error message from a form field
    function clearError(field) {
        field.classList.remove('error');
        var errorDiv = field.parentElement.querySelector('.error-message');
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    }

    // Helper: basic email format check
    function isValidEmail(email) {
        // This checks for something@something.something
        var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailPattern.test(email);
    }


    // ==============================================
    // 6. RIGHT-CLICK BLOCK ON IMAGES
    // Silently prevents the context menu on all
    // images to discourage casual downloading.
    // ==============================================

    document.querySelectorAll('img').forEach(function (img) {
        img.addEventListener('contextmenu', function (event) {
            event.preventDefault();
        });
    });


    // ==============================================
    // 7. ABOUT PAGE PHOTO FADE-IN
    // Keeps the photo hidden until loaded, then
    // fades it in to avoid a jarring pop-in.
    // ==============================================

    var aboutPhoto = document.querySelector('.about-photo');
    if (aboutPhoto) {
        if (aboutPhoto.complete && aboutPhoto.naturalWidth) {
            requestAnimationFrame(function () { aboutPhoto.classList.add('loaded'); });
        } else {
            aboutPhoto.addEventListener('load', function () {
                requestAnimationFrame(function () { aboutPhoto.classList.add('loaded'); });
            });
        }
    }


} // End of initInteractivity
