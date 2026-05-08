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
    'Above-the-Trees.jpg': {
        title: 'Above the Trees',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '123mm',
        shutter: '1/3200',
        aperture: 'f/5.4',
        iso: '800',
        date: '28 Jan 2026'
    },
    'Alone.jpg': {
        title: 'Alone',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '40mm',
        shutter: '1/160',
        aperture: 'f/9',
        iso: '200',
        date: '9 Dec 2025'
    },
    'Autumn-Mandorin.jpg': {
        title: 'Autumn Mandorin',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/500',
        aperture: 'f/6.3',
        iso: '2500',
        date: '15 Nov 2025'
    },
    'Beautiful-Flight.jpg': {
        title: 'Beautiful Flight',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '186mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '64',
        date: '21 Nov 2025'
    },
    'Beautiful-Morning.jpg': {
        title: 'Beautiful Morning',
        camera: 'OM System OM-1 Mark II',
        lens: 'Olympus 300mm F4.0',
        focal: '300mm',
        shutter: '1/4000',
        aperture: 'f/4',
        iso: '4000',
        date: '5 Apr 2026'
    },
    'Blended-Sunrise.jpg': {
        title: 'Blended Sunrise',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '22mm',
        shutter: '1/60',
        aperture: 'f/6.3',
        iso: '250',
        date: '29 Aug 2025'
    },
    'Blue-Mountains.jpg': {
        title: 'Blue Mountains',
        camera: 'Olympus E-PL9',
        lens: 'Olympus 14-42mm F3.5-5.6 EZ',
        focal: '30mm',
        shutter: '1/500',
        aperture: 'f/11',
        iso: '200',
        date: '27 Nov 2024'
    },
    'Buzzing-off.jpg': {
        title: 'Buzzing off',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/2000',
        aperture: 'f/6.3',
        iso: '1000',
        date: '17 Jan 2026'
    },
    'Cable-Car.jpg': {
        title: 'Cable Car',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '35mm',
        shutter: '1/200',
        aperture: 'f/11',
        iso: '200',
        date: '12 Dec 2025'
    },
    'Chamonix.jpg': {
        title: 'Chamonix',
        camera: 'OM System OM-1 Mark II',
        lens: 'OM 12-40mm F2.8 II',
        focal: '19mm',
        shutter: '1/2000',
        aperture: 'f/5.6',
        iso: '200',
        date: '19 Apr 2026'
    },
    'Colourful-London.jpg': {
        title: 'Colourful London',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '12mm',
        shutter: '1/60',
        aperture: 'f/10',
        iso: '4000',
        date: '17 Feb 2025'
    },
    'Curious.jpg': {
        title: 'Curious',
        camera: 'OM System OM-5',
        lens: 'Lumix G 45-200mm F4.0-5.6',
        focal: '200mm',
        shutter: '1/500',
        aperture: 'f/5.6',
        iso: '6400',
        date: '10 Jan 2025'
    },
    'Damp-Start.jpg': {
        title: 'Damp Start',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '40mm',
        shutter: '1/1000',
        aperture: 'f/6.3',
        iso: '1600',
        date: '27 Aug 2025'
    },
    'Dawn-Chorus.jpg': {
        title: 'Dawn Chorus',
        camera: 'OM System OM-1 Mark II',
        lens: 'Olympus 300mm F4.0',
        focal: '300mm',
        shutter: '1/4000',
        aperture: 'f/4',
        iso: '5000',
        date: '5 Apr 2026'
    },
    'Disk.jpg': {
        title: 'Disk',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '300mm',
        shutter: '1/640',
        aperture: 'f/6.3',
        iso: '800',
        date: '15 Aug 2025'
    },
    'Dragonfly.jpg': {
        title: 'Dragonfly',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1000',
        aperture: 'f/6.3',
        iso: '1000',
        date: '26 Aug 2025'
    },
    'Evening-Cormorant.jpg': {
        title: 'Evening Cormorant',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '100mm',
        shutter: '1/640',
        aperture: 'f/9',
        iso: '200',
        date: '2 Mar 2025'
    },
    'Golden-Gazelle.jpg': {
        title: 'Golden Gazelle',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '374mm',
        shutter: '1/1000',
        aperture: 'f/6.3',
        iso: '2000',
        date: '3 Feb 2026'
    },
    'Golden-Grebe.jpg': {
        title: 'Golden Grebe',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1250',
        aperture: 'f/6.3',
        iso: '250',
        date: '2 Feb 2025'
    },
    'Golden-Greenwich.jpg': {
        title: 'Golden Greenwich',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '100mm',
        shutter: '1/200',
        aperture: 'f/5',
        iso: '200',
        date: '23 Jan 2025'
    },
    'Golden-Thames.jpg': {
        title: 'Golden Thames',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '23mm',
        shutter: '1/1000',
        aperture: 'f/9',
        iso: '200',
        date: '21 May 2025'
    },
    'Green.jpg': {
        title: 'Green',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/3200',
        aperture: 'f/6.3',
        iso: '1250',
        date: '30 Dec 2025'
    },
    'Hampstead-Heath.jpg': {
        title: 'Hampstead Heath',
        camera: 'Olympus E-PL9',
        lens: 'Lumix G 45-200mm F4.0-5.6',
        focal: '84mm',
        shutter: '1/500',
        aperture: 'f/8',
        iso: '200',
        date: '27 Oct 2024'
    },
    'Head-On.jpg': {
        title: 'Head On',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '640',
        date: '2 Sep 2025'
    },
    'Hey.jpg': {
        title: 'Hey',
        camera: 'Olympus E-PL9',
        lens: 'Lumix G 45-200mm F4.0-5.6',
        focal: '189mm',
        shutter: '1/1600',
        aperture: 'f/5.6',
        iso: '2500',
        date: '5 Dec 2024'
    },
    'Iridescent.jpg': {
        title: 'Iridescent',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '400',
        date: '2 Sep 2025'
    },
    'Kestrel.jpg': {
        title: 'Kestrel',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '276mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '1600',
        date: '27 Nov 2025'
    },
    'La-Palma-Lizard.jpg': {
        title: 'La Palma Lizard',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1600',
        aperture: 'f/8',
        iso: '500',
        date: '20 Jan 2026'
    },
    'Last-Flight.jpg': {
        title: 'Last Flight',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '80',
        date: '21 Jan 2026'
    },
    'Leopard.jpg': {
        title: 'Leopard',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '2500',
        date: '2 Feb 2026'
    },
    'Lighthouse.jpg': {
        title: 'Lighthouse',
        camera: 'Google Pixel 8a',
        lens: 'Pixel 8a',
        focal: '5mm',
        shutter: '1/2500',
        aperture: 'f/1.9',
        iso: '47',
        date: '25 Oct 2025'
    },
    'London.jpg': {
        title: 'London',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '16mm',
        shutter: '1/320',
        aperture: 'f/2.8',
        iso: '200',
        date: '15 Feb 2026'
    },
    'Moody-Thames.jpg': {
        title: 'Moody Thames',
        camera: 'OM System OM-5',
        lens: 'Olympus 14-42mm F3.5-5.6 EZ',
        focal: '42mm',
        shutter: '1/250',
        aperture: 'f/8',
        iso: '160',
        date: '6 Jan 2025'
    },
    'Morning-Goose.jpg': {
        title: 'Morning Goose',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1250',
        aperture: 'f/6.3',
        iso: '1000',
        date: '2 Feb 2025'
    },
    'Necter.jpg': {
        title: 'Necter',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '1250',
        date: '17 Jan 2026'
    },
    'Perched.jpg': {
        title: 'Perched',
        camera: 'OM System OM-5',
        lens: 'Lumix G 45-200mm F4.0-5.6',
        focal: '200mm',
        shutter: '1/1000',
        aperture: 'f/5.6',
        iso: '4000',
        date: '9 Jan 2025'
    },
    'Poon-Hill.jpg': {
        title: 'Poon Hill',
        camera: 'Olympus E-PL9',
        lens: 'Olympus 14-42mm F3.5-5.6 EZ',
        focal: '42mm',
        shutter: '1/160',
        aperture: 'f/7.1',
        iso: '200',
        date: '27 Nov 2024'
    },
    'Purple.jpg': {
        title: 'Purple',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '40mm',
        shutter: '1/200',
        aperture: 'f/2.8',
        iso: '2500',
        date: '22 Jun 2025'
    },
    'Slick.jpg': {
        title: 'Slick',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/640',
        aperture: 'f/6.3',
        iso: '2500',
        date: '20 Jan 2026'
    },
    'Squirrel.jpg': {
        title: 'Squirrel',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/2000',
        aperture: 'f/6.3',
        iso: '3200',
        date: '20 Feb 2026'
    },
    'Sulphur.jpg': {
        title: 'Sulphur',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '12mm',
        shutter: '1/60',
        aperture: 'f/8',
        iso: '500',
        date: '26 Aug 2025'
    },
    'The-Eye.jpg': {
        title: 'The Eye',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '285mm',
        shutter: '1/640',
        aperture: 'f/7.1',
        iso: '200',
        date: '15 Aug 2025'
    },
    'Unlucky.jpg': {
        title: 'Unlucky',
        camera: 'OM System OM-1 Mark II',
        lens: 'Olympus 300mm F4.0',
        focal: '300mm',
        shutter: '1/5000',
        aperture: 'f/4',
        iso: '640',
        date: '15 Apr 2026'
    },
    'Winter-Walk.jpg': {
        title: 'Winter Walk',
        camera: 'OM System OM-5',
        lens: 'Olympus 14-42mm F3.5-5.6 EZ',
        focal: '42mm',
        shutter: '1/125',
        aperture: 'f/10',
        iso: '200',
        date: '11 Jan 2025'
    },
    'Yum!.jpg': {
        title: 'Yum!',
        camera: 'OM System OM-1 Mark II',
        lens: 'Olympus 300mm F4.0',
        focal: '300mm',
        shutter: '1/3200',
        aperture: 'f/4',
        iso: '1250',
        date: '11 Mar 2026'
    }
};


/* ----------------------------------------------------------
   SECTION 0 — CONTENT LOADING
   Fetches content.json and populates the page before wiring
   up any interactive behaviour. Falls back gracefully if the
   fetch fails (e.g. file:// protocol during local dev).
   ---------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', function () {
    fetch('content.json')
        .then(function (response) { return response.json(); })
        .then(function (content) {
            applySettings(content.settings);
            if (content.portfolio && content.portfolio.length) {
                populatePhotoData(content.portfolio);
                populatePortfolioGallery(content.portfolio);
                populateFeaturedImages(content.portfolio);
            }
            populateAbout(content.about);
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
    if (heroH1 && settings.site_name) heroH1.textContent = settings.site_name;
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

// IMAGE MODE: currently using full res only. To revert to two-tier (thumb gallery + full res lightbox), see git history.

/* Build the masonry gallery on portfolio.html from content.json. */
function populatePortfolioGallery(portfolio) {
    var gallery = document.querySelector('.masonry-gallery');
    if (!gallery) return;
    gallery.innerHTML = '';
    portfolio.forEach(function (photo) {
        var item = document.createElement('div');
        item.className = 'gallery-item';
        item.setAttribute('data-category', photo.category);
        var img = document.createElement('img');
        img.src = 'images/Full%20res/' + photo.filename;
        img.alt = photo.title;
        item.appendChild(img);
        gallery.appendChild(item);
    });

    // Fade in once the first image settles (load or error), with a 1-second
    // hard fallback. Avoids waiting for all 45 full-res files before revealing.
    var revealed = false;
    function revealGallery() {
        if (revealed) return;
        revealed = true;
        gallery.style.opacity = '1';
    }
    var firstImg = gallery.querySelector('img');
    if (!firstImg) { revealGallery(); return; }
    if (firstImg.complete) {
        revealGallery();
    } else {
        firstImg.addEventListener('load',  revealGallery);
        firstImg.addEventListener('error', revealGallery);
    }
    setTimeout(revealGallery, 1000);
}

/* Populate the three featured-item slots on index.html.
   Uses photos marked featured: true; tops up from the rest if fewer than 3. */
function populateFeaturedImages(portfolio) {
    var grid = document.querySelector('.featured-grid');
    if (!grid) return;

    var featured = portfolio.filter(function (p) { return p.featured; });
    if (featured.length < 3) {
        var extras = portfolio.filter(function (p) { return !p.featured; });
        var i = 0;
        while (featured.length < 3 && i < extras.length) {
            featured.push(extras[i++]);
        }
    }

    grid.innerHTML = '';
    featured.slice(0, 3).forEach(function (photo) {
        var item = document.createElement('div');
        item.className = 'featured-item';
        var img = document.createElement('img');
        img.src = 'images/Full%20res/' + photo.filename;
        img.alt = photo.title;
        item.appendChild(img);
        grid.appendChild(item);
    });
}

/* Inject bio text into the about-content div on about.html.
   Injects nothing if bio is empty, leaving the page blank. */
function populateAbout(about) {
    var div = document.querySelector('.about-content');
    if (!div) return;
    div.innerHTML = (about && about.bio) ? about.bio : '';
}

/* Build blog post list on blog.html from the blog array in content.json.
   Renders nothing if the array is empty. */
function populateBlog(blog) {
    var container = document.querySelector('.blog-posts');
    if (!container) return;
    container.innerHTML = '';
    if (!blog || blog.length === 0) return;
    blog.forEach(function (post) {
        var article = document.createElement('article');
        article.className = 'blog-post';
        article.innerHTML =
            '<h2>' + post.title + '</h2>' +
            '<p class="post-date">' + post.date + '</p>' +
            '<p class="post-excerpt">' + post.excerpt + '</p>' +
            '<a href="' + (post.url || '#') + '" class="read-more">Read more</a>';
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

                if (filterCategory === 'all' || itemCategory === filterCategory) {
                    // Show this item
                    item.classList.remove('hidden');
                } else {
                    // Hide this item
                    item.classList.add('hidden');
                }
            });
        });
    });

    // Apply the default active filter on page load (e.g. Wildlife first)
    var activeFilter = document.querySelector('.category-btn.active');
    if (activeFilter && galleryItems.length > 0) {
        var defaultCategory = activeFilter.getAttribute('data-category');
        if (defaultCategory !== 'all') {
            galleryItems.forEach(function (item) {
                var itemCategory = item.getAttribute('data-category');
                if (itemCategory !== defaultCategory) {
                    item.classList.add('hidden');
                }
            });
        }
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

    // Helper: extract the filename from an image src path
    function getFilename(src) {
        return src.split('/').pop().split('?')[0];
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

    // Shared function: open the lightbox for a given image element
    function openLightbox(img) {
        if (!lightbox || !lightboxContent || !img) return;

        var filename = getFilename(img.src);
        var fullResSrc = getFullResUrl(img.src);

        // Build the lightbox content: start with thumb, then swap to full-res
        var html = '<img src="' + img.src + '" alt="' + (img.alt || '') + '">';
        html += buildMetaHTML(filename);

        lightboxContent.innerHTML = html;

        // Show the lightbox immediately with the thumbnail
        lightbox.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Load the full-resolution image in the background, then swap it in
        if (fullResSrc !== img.src) {
            var fullImg = new Image();
            fullImg.onload = function () {
                var lightboxImg = lightboxContent.querySelector('img');
                if (lightboxImg) {
                    lightboxImg.src = fullResSrc;
                }
            };
            fullImg.src = fullResSrc;
        }
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

    // Close when pressing the Escape key
    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeLightbox();
        }
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


} // End of initInteractivity
