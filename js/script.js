/* ==========================================================
   STONEMAN PHOTOGRAPHY - Main JavaScript

   This file handles all interactive features on the site:
   1. Mobile hamburger menu (open/close)
   2. Active page highlighting in the navigation
   3. Portfolio category filter buttons
   4. Portfolio lightbox (full-screen image viewer)
   5. Contact form validation
   ========================================================== */


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
    // category button is clicked.
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
    // 4. LIGHTBOX (Full-Screen Image Viewer)
    // Click a gallery image to view it large.
    // Close with X button, clicking outside, or ESC.
    // ==============================================

    var lightbox = document.querySelector('.lightbox');
    var lightboxContent = document.querySelector('.lightbox-content');
    var lightboxClose = document.querySelector('.lightbox-close');

    // Open the lightbox when a gallery item is clicked
    galleryItems.forEach(function (item) {
        item.addEventListener('click', function () {
            if (!lightbox || !lightboxContent) return;

            // Get the label text from the clicked item
            var labelSpan = item.querySelector('span');
            var labelText = labelSpan ? labelSpan.textContent : 'Photo';

            // Put the label text into the lightbox
            var lightboxSpan = lightboxContent.querySelector('span');
            if (lightboxSpan) {
                lightboxSpan.textContent = labelText;
            }

            // Show the lightbox
            lightbox.classList.add('active');

            // Prevent the page from scrolling while lightbox is open
            document.body.style.overflow = 'hidden';
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
