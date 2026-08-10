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
    'Necter.jpg':                { title: 'Nectar',                camera: 'OM System OM-5',          lens: 'OM 100-400mm F5.0-6.3',       focal: '400mm',  shutter: '1/1600', aperture: 'f/6.3', iso: '1250', date: '17 Jan 2026' },
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
            populateCategories(content.categories);
            if (content.portfolio && content.portfolio.length) {
                populatePhotoData(content.portfolio);
                populatePortfolioGallery(content.portfolio);
                populateFeaturedImages(content.portfolio, content.featured_images);
            }
            populateBlog(content.blog);
            initInteractivity();
        })
        .catch(function () {
            // content.json unavailable — existing hardcoded HTML and photoData take over
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
        var img = document.createElement('img');
        img.src = 'images/Thumb/' + photo.filename;
        img.alt = photo.title;
        item.appendChild(img);
        gallery.appendChild(item);
    });

    // Masonry is initialised from initInteractivity() after the default filter runs.
}

/* Populate the three featured-item slots on index.html.
   Uses featured_images array from content.json for explicit ordering;
   falls back to featured: true flag if the array is absent. */
function populateFeaturedImages(portfolio, featuredImages) {
    var grid = document.querySelector('.featured-grid');
    if (!grid) return;

    var byFilename = {};
    portfolio.forEach(function (p) { byFilename[p.filename] = p; });

    var featured;
    if (featuredImages && featuredImages.length) {
        featured = featuredImages.map(function (fn) { return byFilename[fn]; }).filter(Boolean);
        if (featured.length < 3) {
            portfolio.forEach(function (p) {
                if (featured.length < 3 && featuredImages.indexOf(p.filename) === -1) featured.push(p);
            });
        }
    } else {
        featured = portfolio.filter(function (p) { return p.featured; });
        if (featured.length < 3) {
            var extras = portfolio.filter(function (p) { return !p.featured; });
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
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    container.innerHTML = categories.map(function (cat, i) {
        return '<button class="category-btn' + (i === 0 ? ' active' : '') +
               '" data-category="' + esc(cat.key) + '">' + esc(cat.label) + '</button>';
    }).join('');
}

/* Build blog post list on blog.html from the blog array in content.json.
   Each post: { title, date, body, images: [filename, …] }. Renders nothing
   if the array is empty. Body text supports blank-line-separated paragraphs. */
function populateBlog(blog) {
    var container = document.querySelector('.blog-posts');
    if (!container) return;
    container.innerHTML = '';
    if (!blog || blog.length === 0) return;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function textToParas(text) {
        var out = '';
        (text || '').split(/\n\n+/).forEach(function (para) {
            if (para.trim()) out += '<p class="post-body">' + esc(para).replace(/\n/g, '<br>') + '</p>';
        });
        return out;
    }

    function imageTag(b, alt) {
        // b.src is a full repo-relative path; older posts used b.filename (in images/Blog/).
        var src = b.src || (b.filename ? 'images/Blog/' + b.filename : '');
        if (!src) return '';
        var cls = (b.size === 'full' || b.align === 'full')
            ? 'blog-image img-full'
            : 'blog-image img-' + (b.size || 'medium') + ' img-' + (b.align || 'center');
        return '<img class="' + cls + '" src="' + encodeURI(src) +
               '" alt="' + esc(alt) + '" loading="lazy">';
    }

    /* Old-style posts ({ body, images }) become blocks so both render the same way. */
    function asBlocks(post) {
        if (post.blocks) return post.blocks;
        var blocks = [];
        (post.images || []).forEach(function (fn) {
            blocks.push({ type: 'image', filename: fn, size: 'full', align: 'full' });
        });
        if (post.body) blocks.push({ type: 'text', text: post.body });
        else if (post.excerpt) blocks.push({ type: 'text', text: post.excerpt });
        return blocks;
    }

    blog.forEach(function (post) {
        var article = document.createElement('article');
        article.className = 'blog-post';

        var html = '<h2>' + esc(post.title) + '</h2>';
        if (post.date) html += '<span class="blog-date">' + esc(post.date) + '</span>';

        asBlocks(post).forEach(function (b) {
            if (b.type === 'text') html += textToParas(b.text);
            else if (b.type === 'image') html += imageTag(b, post.title);
        });

        article.innerHTML = html;
        container.appendChild(article);
    });
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
    var currentPage = window.location.pathname.split('/').pop();

    // If we're at the root with no filename, it's the home page
    if (currentPage === '' || currentPage === '/') {
        currentPage = 'index.html';
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

            // Re-run Masonry so it only places visible items
            if (msnry) {
                var gal = document.querySelector('.masonry-gallery');
                var cs2 = window.getComputedStyle(gal);
                var inner2 = gal.clientWidth - parseFloat(cs2.paddingLeft) - parseFloat(cs2.paddingRight);
                var cols2 = window.innerWidth > 1199 ? 3 : window.innerWidth > 767 ? 2 : 1;
                var colW2 = Math.floor((inner2 - 14 * (cols2 - 1)) / cols2);
                msnry.destroy();
                msnry = new Masonry(gal, {
                    itemSelector: '.gallery-item:not(.hidden)',
                    columnWidth: colW2,
                    gutter: 14,
                    horizontalOrder: true,
                    transitionDuration: 0
                });
            }
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
                itemSelector: '.gallery-item:not(.hidden)',
                columnWidth: colW,
                gutter: 14,
                horizontalOrder: true,
                transitionDuration: 0
            });

            // Wait for all images to finish loading, do one final layout, then reveal.
            // rAF defers the opacity reveal until after the browser has painted the
            // Masonry positions, preventing items shuffling during the fade-in.
            imagesLoaded(msnryGallery, function () {
                if (msnry) msnry.layout();
                requestAnimationFrame(function () {
                    msnryGallery.style.opacity = '1';
                });
            });

            // Rebuild on resize so column count and item widths stay in sync.
            window.addEventListener('resize', function () {
                var newColW = calcColWidth();
                applyColWidth(newColW);
                if (msnry) {
                    msnry.destroy();
                    msnry = new Masonry(msnryGallery, {
                        itemSelector: '.gallery-item:not(.hidden)',
                        columnWidth: newColW,
                        gutter: 14,
                        horizontalOrder: true,
                        transitionDuration: 0
                    });
                }
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

        var filename = getFilename(img.src);
        var fullResSrc = getFullResUrl(img.src);

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
