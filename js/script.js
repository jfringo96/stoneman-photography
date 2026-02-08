/* ==========================================================
   STONEMAN PHOTOGRAPHY - Main JavaScript

   This file handles all interactive features on the site:
   1. Mobile hamburger menu (open/close)
   2. Active page highlighting in the navigation
   3. Portfolio category filter buttons
   4. Lightbox with EXIF metadata (works on portfolio + home)
   5. Contact form validation
   ========================================================== */


/* ----------------------------------------------------------
   PHOTO METADATA
   EXIF data and placeholder titles for each image.
   Pulled from the actual file metadata.
   ---------------------------------------------------------- */

var photoData = {
    'p2039427.jpg': {
        title: 'Golden Hour Guardian',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '374mm',
        shutter: '1/1000',
        aperture: 'f/6.3',
        iso: '2000',
        date: '3 Feb 2026'
    },
    'p2028335.jpg': {
        title: 'Through the Canopy',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '2500',
        date: '2 Feb 2026'
    },
    'p9024421.jpg': {
        title: 'Face to Face',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '640',
        date: '2 Sep 2025'
    },
    'p9024452.jpg': {
        title: 'Wings of Steel',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '1000',
        date: '2 Sep 2025'
    },
    'p9024319.jpg': {
        title: 'Iridescent Flight',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '400',
        date: '2 Sep 2025'
    },
    'pb150612.jpg': {
        title: 'Woodland Jewel',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/500',
        aperture: 'f/6.3',
        iso: '2500',
        date: '15 Nov 2025'
    },
    'pb150585.jpg': {
        title: 'Side by Side',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/400',
        aperture: 'f/6.3',
        iso: '1600',
        date: '15 Nov 2025'
    },
    'p1286163.jpg': {
        title: 'Above the Treeline',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '123mm',
        shutter: '1/2500',
        aperture: 'f/5.4',
        iso: '640',
        date: '28 Jan 2026'
    },
    'p2021807.jpg': {
        title: 'Morning Glide',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1250',
        aperture: 'f/6.3',
        iso: '1000',
        date: '2 Feb 2025'
    },
    'p2021437.jpg': {
        title: 'Misty Dawn',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1250',
        aperture: 'f/6.3',
        iso: '250',
        date: '2 Feb 2025'
    },
    'p4051810.jpg': {
        title: 'Suspended',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/2500',
        aperture: 'f/6.3',
        iso: '3200',
        date: '5 Apr 2025'
    },
    'p8262697.jpg': {
        title: 'Blue Perch',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1000',
        aperture: 'f/6.3',
        iso: '1000',
        date: '26 Aug 2025'
    },
    'p9064970.jpg': {
        title: 'Ancient Predator',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/800',
        aperture: 'f/6.3',
        iso: '2000',
        date: '6 Sep 2025'
    },
    'pb270047.jpg': {
        title: 'Windswept',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '276mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '1600',
        date: '27 Nov 2025'
    },
    'pb210360.jpg': {
        title: 'Evening Departure',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '186mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '64',
        date: '21 Nov 2025'
    },
    'pc051978.jpg': {
        title: 'The Stare',
        camera: 'Olympus E-PL9',
        lens: 'Lumix G 45-200mm F4.0-5.6',
        focal: '189mm',
        shutter: '1/1600',
        aperture: 'f/5.6',
        iso: '2500',
        date: '5 Dec 2024'
    },
    'pc302391.jpg': {
        title: 'Hidden in Green',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/3200',
        aperture: 'f/6.3',
        iso: '1250',
        date: '30 Dec 2025'
    },
    'p3023333-enhanced-nr.jpg': {
        title: 'City Silhouette',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '100mm',
        shutter: '1/640',
        aperture: 'f/9',
        iso: '200',
        date: '2 Mar 2025'
    },
    'p1173612.jpg': {
        title: 'Lavender Feast',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '1250',
        date: '17 Jan 2026'
    },
    'p1173653.jpg': {
        title: 'Golden Approach',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/2000',
        aperture: 'f/6.3',
        iso: '1000',
        date: '17 Jan 2026'
    },
    'p1204350.jpg': {
        title: 'Volcanic Lookout',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1600',
        aperture: 'f/8',
        iso: '500',
        date: '20 Jan 2026'
    },
    'p1204386.jpg': {
        title: 'Open Wide',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/640',
        aperture: 'f/6.3',
        iso: '2500',
        date: '20 Jan 2026'
    },
    'p1214602.jpg': {
        title: 'Last Light Landing',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '400mm',
        shutter: '1/1600',
        aperture: 'f/6.3',
        iso: '80',
        date: '21 Jan 2026'
    },
    // --- Landscape / Other ---
    'pb271294.jpg': {
        title: 'Peaks Above the Clouds',
        camera: 'Olympus E-PL9',
        lens: 'Olympus 14-42mm F3.5-5.6 EZ',
        focal: '30mm',
        shutter: '1/500',
        aperture: 'f/11',
        iso: '200',
        date: '27 Nov 2024'
    },
    'pb271268.jpg': {
        title: 'First Light',
        camera: 'Olympus E-PL9',
        lens: 'Olympus 14-42mm F3.5-5.6 EZ',
        focal: '42mm',
        shutter: '1/160',
        aperture: 'f/7.1',
        iso: '200',
        date: '27 Nov 2024'
    },
    'p8293903.jpg': {
        title: 'Sea of Clouds',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '22mm',
        shutter: '1/60',
        aperture: 'f/6.3',
        iso: '250',
        date: '29 Aug 2025'
    },
    'p3084741.jpg': {
        title: 'The Passage',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '12mm',
        shutter: '1/160',
        aperture: 'f/9',
        iso: '200',
        date: '8 Mar 2025'
    },
    'p6220613.jpg': {
        title: 'Lake District Sunset',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '40mm',
        shutter: '1/320',
        aperture: 'f/8',
        iso: '200',
        date: '22 Jun 2025'
    },
    'p8262837.jpg': {
        title: 'Crater Dawn',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '12mm',
        shutter: '1/60',
        aperture: 'f/8',
        iso: '500',
        date: '26 Aug 2025'
    },
    'p8150703.jpg': {
        title: 'Golden Skyline',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '285mm',
        shutter: '1/640',
        aperture: 'f/7.1',
        iso: '200',
        date: '15 Aug 2025'
    },
    'p8150903.jpg': {
        title: 'Red Over London',
        camera: 'OM System OM-5',
        lens: 'OM 100-400mm F5.0-6.3',
        focal: '300mm',
        shutter: '1/640',
        aperture: 'f/6.3',
        iso: '800',
        date: '15 Aug 2025'
    },
    'p5212175-enhanced-nr.jpg': {
        title: 'Thames Crossing',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '23mm',
        shutter: '1/1000',
        aperture: 'f/9',
        iso: '200',
        date: '21 May 2025'
    },
    'pa270146.jpg': {
        title: 'City Through the Mist',
        camera: 'Olympus E-PL9',
        lens: 'Lumix G 45-200mm F4.0-5.6',
        focal: '84mm',
        shutter: '1/500',
        aperture: 'f/8',
        iso: '200',
        date: '27 Oct 2024'
    },
    'pa055403.jpg': {
        title: 'Storm Watch',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '30mm',
        shutter: '1/400',
        aperture: 'f/9',
        iso: '200',
        date: '5 Oct 2025'
    },
    'p1110608-hdr.jpg': {
        title: 'Frost Walk',
        camera: 'OM System OM-5',
        lens: 'Olympus 14-42mm F3.5-5.6 EZ',
        focal: '42mm',
        shutter: '1/125',
        aperture: 'f/10',
        iso: '200',
        date: '11 Jan 2025'
    },
    '2025-10-31-20-52-05-c-s4-.jpg': {
        title: 'Forest Light',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '40mm',
        shutter: '1/200',
        aperture: 'f/2.8',
        iso: '400',
        date: '31 Oct 2025'
    },
    'pb281436.jpg': {
        title: 'Painted Sky',
        camera: 'Olympus E-PL9',
        lens: 'Olympus 14-42mm F3.5-5.6 EZ',
        focal: '14mm',
        shutter: '1/30',
        aperture: 'f/4',
        iso: '800',
        date: '28 Nov 2024'
    },
    'pc090703.jpg': {
        title: 'Winter Solitude',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '40mm',
        shutter: '1/160',
        aperture: 'f/9',
        iso: '200',
        date: '9 Dec 2025'
    },
    'pc121226.jpg': {
        title: 'Alpine Crossing',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '35mm',
        shutter: '1/200',
        aperture: 'f/11',
        iso: '200',
        date: '12 Dec 2025'
    },
    'p9054824.jpg': {
        title: 'Golden Wake',
        camera: 'OM System OM-5',
        lens: 'OM 12-40mm F2.8 II',
        focal: '40mm',
        shutter: '1/800',
        aperture: 'f/2.8',
        iso: '500',
        date: '5 Sep 2025'
    }
};


/* ----------------------------------------------------------
   WAIT FOR PAGE TO LOAD
   Everything inside runs once the HTML is fully loaded.
   ---------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', function () {


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
                menuToggle.textContent = '\u2715'; // X symbol
                menuToggle.setAttribute('aria-expanded', 'true');
            } else {
                menuToggle.textContent = '\u2630'; // Hamburger symbol
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
                menuToggle.textContent = '\u2630';
                menuToggle.setAttribute('aria-expanded', 'false');
            }
        });

        // Close the menu when a link inside it is clicked
        navLinks.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', function () {
                navLinks.classList.remove('active');
                menuToggle.textContent = '\u2630';
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

        // Build the lightbox content: image + metadata
        var html = '<img src="' + img.src + '" alt="' + (img.alt || '') + '">';
        html += buildMetaHTML(filename);

        lightboxContent.innerHTML = html;

        // Show the lightbox
        lightbox.classList.add('active');

        // Prevent the page from scrolling while lightbox is open
        document.body.style.overflow = 'hidden';
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
    // before showing a confirmation message.
    // Note: No backend yet - just a front-end demo.
    // ==============================================

    var contactForm = document.querySelector('.contact-form');

    if (contactForm) {
        contactForm.addEventListener('submit', function (event) {
            // Prevent the form from actually submitting (no backend)
            event.preventDefault();

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

            // If everything is valid, show the success message
            if (isValid) {
                contactForm.style.display = 'none';
                var successMessage = document.querySelector('.form-success');
                if (successMessage) {
                    successMessage.style.display = 'block';
                }
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


}); // End of DOMContentLoaded
