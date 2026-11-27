/* ==========================================================
   STONEMAN PHOTOGRAPHY — Site Manager (admin tool)

   A self-contained editor for the site. It talks directly to
   GitHub on your behalf: reading content.json to show your
   current photos, and committing changes back so the live
   site updates — all without you touching code.

   Phase 1: login + read (done).
   Phase 2: PHOTOS — list, reorder, remove, featured, add new
            (auto-EXIF + auto-thumbnail + safe filenames).
   ========================================================== */


/* ----------------------------------------------------------
   CONFIG — which repo/branch we read & write.
   Points at the SAFE 'admin-panel' branch while we build/test.
   Flip to 'master' only when everything works.
   ---------------------------------------------------------- */

var CONFIG = {
    owner:  'jfringo96',
    repo:   'stoneman-photography',
    branch: 'master'               // LIVE — the Site Manager now edits the real site
};

var API = 'https://api.github.com';
var TOKEN_KEY = 'sp_admin_token';
var THUMB_MAX_EDGE = 1000;         // longest side of generated thumbnails (px)
var THUMB_QUALITY  = 0.82;
var BLOG_MAX_EDGE  = 1600;         // blog images are resized down to this
var BLOG_QUALITY   = 0.85;
var MAX_FEATURED   = 3;            // home page shows 3 featured photos
var SCRIPT_VERSION = 17;           // script.js?v=N used by generated project pages —
                                   // keep in step with the HTML pages when script.js changes


/* In-memory copy of the site content while editing. */
var state = {
    content:   null,   // parsed content.json
    byFilename: {},     // filename -> photo object
    featured:  []       // filenames currently starred (order matters)
};


/* ----------------------------------------------------------
   SMALL HELPERS
   ---------------------------------------------------------- */

function $(id) { return document.getElementById(id); }
function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

function b64DecodeUnicode(str) {
    var clean = (str || '').replace(/\n/g, '');
    var bytes = atob(clean);
    var percent = Array.prototype.map.call(bytes, function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join('');
    return decodeURIComponent(percent);
}

function b64EncodeUnicode(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (m, p1) {
        return String.fromCharCode(parseInt(p1, 16));
    }));
}

function escapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showStatus(el, message, type) {
    el.textContent = message;
    el.className = 'status ' + (type || 'ok');
    el.classList.remove('hidden');
}

/* Turn a photo title into a safe filename slug — no spaces, accents or
   punctuation, which is exactly the class of bug that broke "Lone squirrel"
   and Grasshopper. */
function slugify(s) {
    return (s || '').toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'photo';
}

/* Ensure a filename doesn't clash with an existing one. */
function uniqueFilename(base, ext, taken) {
    var name = base + ext;
    var i = 2;
    while (taken[name]) { name = base + '-' + i + ext; i++; }
    return name;
}

function distinctValues(list, key) {
    var seen = {}, out = [];
    (list || []).forEach(function (item) {
        var v = item[key];
        if (v && !seen[v]) { seen[v] = true; out.push(v); }
    });
    return out.sort();
}

function prettyLabel(key) {
    return key.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

/* Make sure state.content.categories exists. If not, seed it from the category
   keys actually used by the photos (keeping the two known friendly labels). */
function ensureCategories() {
    if (state.content.categories && state.content.categories.length) return;
    var labels = { wildlife: 'Wildlife and Nature', landscape: 'Landscape and City' };
    var seen = {}, keys = [];
    (state.content.portfolio || []).forEach(function (p) {
        if (p.category && !seen[p.category]) { seen[p.category] = true; keys.push(p.category); }
    });
    if (!keys.length) keys = ['wildlife'];
    state.content.categories = keys.map(function (k) {
        return { key: k, label: labels[k] || prettyLabel(k) };
    });
}

/* <option> list for a category <select>, marking selectedKey. */
function categoryOptions(selectedKey) {
    return (state.content.categories || []).map(function (c) {
        return '<option value="' + escapeHtml(c.key) + '"' +
               (c.key === selectedKey ? ' selected' : '') + '>' + escapeHtml(c.label) + '</option>';
    }).join('');
}

/* Pick a category key not already in `used`. */
function uniqueKey(base, used) {
    base = base || 'category';
    var k = base, i = 2;
    while (used[k]) { k = base + '-' + i; i++; }
    return k;
}

/* Re-point every photo in oldKey to newKey (and any blog post or project
   that files its uploads there). */
function migratePhotoCategory(oldKey, newKey) {
    (state.content.portfolio || []).forEach(function (p) {
        if (p.category === oldKey) p.category = newKey;
    });
    ['blog', 'projects'].forEach(function (k) {
        (state.content[k] || []).forEach(function (item) {
            if (item.photo_category === oldKey) item.photo_category = newKey;
        });
    });
}


/* ----------------------------------------------------------
   GITHUB API
   ---------------------------------------------------------- */

function ghHeaders() {
    return {
        'Authorization': 'Bearer ' + getToken(),
        'Accept': 'application/vnd.github+json'
    };
}

/* Read a file from the repo. Returns { text, sha }. */
function ghGetFile(path) {
    var url = API + '/repos/' + CONFIG.owner + '/' + CONFIG.repo +
              '/contents/' + encodeURIComponent(path).replace(/%2F/g, '/') +
              '?ref=' + encodeURIComponent(CONFIG.branch) + '&t=' + Date.now();

    return fetch(url, { headers: ghHeaders(), cache: 'no-store' }).then(function (res) {
        if (res.status === 401) throw new Error('Token rejected — it may be wrong or expired.');
        if (res.status === 404) throw new Error('Could not find ' + path + ' on branch "' + CONFIG.branch + '".');
        if (!res.ok) throw new Error('GitHub error (' + res.status + ').');
        return res.json();
    }).then(function (data) {
        return { sha: data.sha, text: b64DecodeUnicode(data.content) };
    });
}

/* Generic JSON call for the Git Data API. */
function ghApi(method, path, body) {
    var opts = { method: method, headers: ghHeaders(), cache: 'no-store' };
    if (body) {
        opts.headers = Object.assign({}, ghHeaders(), { 'Content-Type': 'application/json' });
        opts.body = JSON.stringify(body);
    }
    return fetch(API + path, opts).then(function (res) {
        if (!res.ok) {
            return res.text().then(function (t) {
                throw new Error('GitHub ' + res.status + ': ' + t.slice(0, 200));
            });
        }
        return res.json();
    });
}

/* Commit one or more files in a SINGLE atomic commit via the Git Trees API.
   Retries once if the branch moved under us (the "not a fast forward" race),
   re-reading the latest position before trying again.
   opts = { upserts: [{ path, base64 }], deletes: [path], message }        */
function commitChanges(opts) {
    return commitOnce(opts).catch(function (err) {
        if (/not a fast forward|\b422\b/i.test(err.message)) {
            return commitOnce(opts);
        }
        throw err;
    });
}

function commitOnce(opts) {
    var base = '/repos/' + CONFIG.owner + '/' + CONFIG.repo;
    var latestSha, baseTreeSha;

    return ghApi('GET', base + '/git/ref/heads/' + CONFIG.branch)
        .then(function (ref) {
            latestSha = ref.object.sha;
            return ghApi('GET', base + '/git/commits/' + latestSha);
        })
        .then(function (commit) {
            baseTreeSha = commit.tree.sha;
            var upserts = opts.upserts || [];
            return Promise.all(upserts.map(function (u) {
                return ghApi('POST', base + '/git/blobs', { content: u.base64, encoding: 'base64' })
                    .then(function (blob) {
                        return { path: u.path, mode: '100644', type: 'blob', sha: blob.sha };
                    });
            }));
        })
        .then(function (treeEntries) {
            (opts.deletes || []).forEach(function (p) {
                treeEntries.push({ path: p, mode: '100644', type: 'blob', sha: null });
            });
            return ghApi('POST', base + '/git/trees', { base_tree: baseTreeSha, tree: treeEntries });
        })
        .then(function (tree) {
            return ghApi('POST', base + '/git/commits', {
                message: opts.message, tree: tree.sha, parents: [latestSha]
            });
        })
        .then(function (commit) {
            return ghApi('PATCH', base + '/git/refs/heads/' + CONFIG.branch, { sha: commit.sha });
        });
}


/* ----------------------------------------------------------
   IMAGE HELPERS — EXIF reading + thumbnail generation
   (both run in your browser; nothing is uploaded until you save)
   ---------------------------------------------------------- */

var CAMERA_NAMES = {
    'OM-1MarkII': 'OM System OM-1 Mark II',
    'OM-1':       'OM System OM-1',
    'OM-5':       'OM System OM-5',
    'E-PL9':      'Olympus E-PL9'
};

function prettyCamera(make, model) {
    if (!model) return '';
    if (CAMERA_NAMES[model]) return CAMERA_NAMES[model];
    if (make && /om digital/i.test(make)) return 'OM System ' + model;
    if (make && !new RegExp(make, 'i').test(model)) return make + ' ' + model;
    return model;
}

function prettyLens(lens) {
    if (!lens) return '';
    return lens.replace(/^OLYMPUS M\./i, 'Olympus ').trim();
}

function formatShutter(exp) {
    if (!exp) return '';
    if (exp >= 1) return exp + 's';
    return '1/' + Math.round(1 / exp);
}

function formatDate(d) {
    if (!d) return '';
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt)) return '';
    return dt.getDate() + ' ' + months[dt.getMonth()] + ' ' + dt.getFullYear();
}

/* Read EXIF from a File and map it to our fields (best effort; all editable). */
function readExif(file) {
    if (typeof exifr === 'undefined') return Promise.resolve({});
    return exifr.parse(file, { tiff: true, exif: true }).then(function (x) {
        if (!x) return {};
        var iso = x.ISO || x.ISOSpeedRatings || x.PhotographicSensitivity;
        return {
            camera:   prettyCamera(x.Make, x.Model),
            lens:     prettyLens(x.LensModel || x.LensMake),
            focal:    x.FocalLength ? Math.round(x.FocalLength) + 'mm' : '',
            shutter:  formatShutter(x.ExposureTime),
            aperture: x.FNumber ? 'f/' + (Math.round(x.FNumber * 10) / 10) : '',
            iso:      iso ? String(iso) : '',
            date:     formatDate(x.DateTimeOriginal)
        };
    }).catch(function () { return {}; });
}

/* Resize a File down to a JPEG Blob no larger than maxEdge on its longest side. */
function resizeToBlob(file, maxEdge, quality) {
    return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () {
            var scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
            var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
            var canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            URL.revokeObjectURL(url);
            canvas.toBlob(function (blob) {
                blob ? resolve(blob) : reject(new Error('Could not process that image.'));
            }, 'image/jpeg', quality);
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
        img.src = url;
    });
}

/* Thumbnail helper for portfolio photos. */
function makeThumb(file, maxEdge) {
    return resizeToBlob(file, maxEdge, THUMB_QUALITY);
}

function fileToBase64(fileOrBlob) {
    return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () { resolve(r.result.split(',')[1]); };
        r.onerror = function () { reject(new Error('Could not read file.')); };
        r.readAsDataURL(fileOrBlob);
    });
}


/* ----------------------------------------------------------
   VIEW SWITCHING + BANNER
   ---------------------------------------------------------- */

function renderBranchBanner() {
    var banner = $('branchBanner');
    if (CONFIG.branch === 'master') {
        banner.className = 'branch-banner live';
        banner.innerHTML = '⚠ You are editing the <strong>LIVE site</strong>. Changes appear online within about a minute.';
    } else {
        banner.className = 'branch-banner';
        banner.innerHTML = 'Safe mode: editing the <strong>' + CONFIG.branch +
            '</strong> test branch. Nothing here affects the live site.';
    }
}

function showLogin() {
    $('loginCard').classList.remove('hidden');
    $('app').classList.add('hidden');
    $('disconnectBtn').classList.add('hidden');
}
function showApp() {
    $('loginCard').classList.add('hidden');
    $('app').classList.remove('hidden');
    $('disconnectBtn').classList.remove('hidden');
}


/* ----------------------------------------------------------
   LOAD CONTENT + RENDER PHOTOS
   ---------------------------------------------------------- */

function loadContent() {
    return ghGetFile('content.json').then(function (file) {
        state.content = JSON.parse(file.text);
        state.byFilename = {};
        (state.content.portfolio || []).forEach(function (p) { state.byFilename[p.filename] = p; });
        state.featured = (state.content.featured_images || []).slice();
        ensureCategories();
        // Snapshot category labels so a save can tell which were renamed.
        state.catOriginalLabels = {};
        (state.content.categories || []).forEach(function (c) {
            if (c.key) state.catOriginalLabels[c.key] = c.label;
        });
        renderActiveTab();
    });
}

function currentTab() {
    var t = document.querySelector('.tab.active');
    return t ? t.getAttribute('data-tab') : 'photos';
}

/* Re-render whichever tab is currently open (used after a save/reload). */
function renderActiveTab() {
    var which = currentTab();
    var wrap = document.querySelector('.wrap');
    if (wrap) wrap.classList.remove('wide', 'editing');   // only Arrange / the layout editor widen the page
    if (which === 'hero') loadHeroPanel();
    else if (which === 'blog') renderBlogPanel();
    else if (which === 'text') loadTextPanel();
    else if (which === 'categories') renderCategoriesPanel();
    else if (which === 'projects') renderProjectsPanel();
    else renderPhotos();
}

function renderPhotos() {
    var body = $('panelBody');
    var photos = state.content.portfolio || [];

    var rows = photos.map(function (p) {
        var isFeatured = state.featured.indexOf(p.filename) !== -1;
        return '' +
        '<div class="photo-row" data-filename="' + escapeHtml(p.filename) + '" data-category="' + escapeHtml(p.category) + '">' +
            '<span class="reorder">' +
                '<button class="up" title="Move up" aria-label="Move up">▲</button>' +
                '<button class="down" title="Move down" aria-label="Move down">▼</button>' +
            '</span>' +
            '<span class="drag" title="Drag to reorder">⋮⋮</span>' +
            '<img src="' + imgSrc(p.filename) + '" alt="" loading="lazy">' +
            '<div class="photo-meta">' +
                '<span class="photo-title">' + escapeHtml(p.title) + '</span>' +
                '<span class="badge ' + escapeHtml(p.category) + '">' + escapeHtml(p.category) + '</span>' +
            '</div>' +
            '<button class="star ' + (isFeatured ? 'active' : '') + '" title="Show on home page">★</button>' +
            '<button class="photo-edit" title="Edit photo info">Edit</button>' +
            '<button class="remove" title="Remove photo">Remove</button>' +
        '</div>';
    }).join('');

    body.innerHTML =
        '<div class="photo-toolbar">' +
            '<button id="addPhotoBtn">+ Add photo</button>' +
            '<div class="toolbar-right">' +
                '<span class="featured-count"></span>' +
                '<button id="savePhotosBtn" class="secondary">Save changes</button>' +
            '</div>' +
        '</div>' +
        '<div class="save-status status hidden" id="saveStatus"></div>' +
        '<div class="featured-panel">' +
            '<div class="featured-head">Featured on the home page — left to right (use ◀ ▶ to arrange)</div>' +
            '<div class="featured-strip" id="featuredStrip"></div>' +
        '</div>' +
        '<div class="add-form-holder" id="addFormHolder"></div>' +
        '<div class="order-bar">' +
            '<div class="view-toggle">' +
                '<button class="view-btn" data-view="list">List</button>' +
                '<button class="view-btn" data-view="arrange">Arrange like the Portfolio page</button>' +
            '</div>' +
            '<div class="cat-filter" id="catFilter"></div>' +
            '<div class="arrange-cols" id="arrangeColsPick"></div>' +
        '</div>' +
        '<p class="help arrange-help" id="arrangeHelp">Drag the photos into the order you want. This is laid out exactly like the ' +
            'Portfolio page: each photo goes into whichever column is shortest, so they read roughly left to right, top to bottom. ' +
            'Drop a photo onto another to take its place. Click "Save changes" when you\'re happy.</p>' +
        '<div class="photo-list" id="photoList">' + rows + '</div>' +
        '<div class="arrange-grid" id="arrangeGrid"></div>';

    // Drag-to-reorder
    if (typeof Sortable !== 'undefined') {
        Sortable.create($('photoList'), { handle: '.drag', animation: 150 });
    }

    updateFeaturedCount();
    renderFeaturedStrip();
    wirePhotoEvents();
    renderOrderBar();
    applyPhotoView();
}


/* ----------------------------------------------------------
   CATEGORY FILTER + "ARRANGE" VIEW
   The Portfolio page only ever shows one category at a time, so
   only the order of photos *within* a category matters. The list
   can be filtered to one category, and the Arrange view shows a
   category laid out exactly like the live page for drag and drop.
   The list (#photoList) always stays the source of truth: the
   Arrange view writes its order back into it, so "Save changes"
   works the same either way.
   ---------------------------------------------------------- */

var photoView = {
    mode: 'list',      // 'list' | 'arrange'
    category: null,    // category key, or 'all' (list view only)
    cols: 3            // columns to preview in Arrange (3 desktop, 2 tablet, 1 phone)
};

function photoCategories() {
    return (state.content.categories || []).filter(function (c) { return c.key; });
}

function renderOrderBar() {
    var cats = photoCategories();
    if (photoView.category !== 'all' &&
        !cats.some(function (c) { return c.key === photoView.category; })) {
        photoView.category = cats.length ? cats[0].key : 'all';
    }

    var btns = cats.map(function (c) {
        return '<button class="cat-btn' + (c.hidden ? ' cat-offsite' : '') + '" data-cat="' + escapeHtml(c.key) + '"' +
               (c.hidden ? ' title="Not shown on the Portfolio page"' : '') + '>' + escapeHtml(c.label || c.key) + '</button>';
    });
    btns.push('<button class="cat-btn cat-all" data-cat="all">All</button>');
    $('catFilter').innerHTML = btns.join('');

    $('arrangeColsPick').innerHTML =
        [[3, 'Desktop'], [2, 'Tablet'], [1, 'Phone']].map(function (o) {
            return '<button class="cols-btn" data-cols="' + o[0] + '">' + o[1] + '</button>';
        }).join('');

    document.querySelectorAll('.view-btn').forEach(function (b) {
        b.addEventListener('click', function () {
            photoView.mode = this.getAttribute('data-view');
            applyPhotoView();
        });
    });
    document.querySelectorAll('.cat-btn').forEach(function (b) {
        b.addEventListener('click', function () {
            photoView.category = this.getAttribute('data-cat');
            applyPhotoView();
        });
    });
    document.querySelectorAll('.cols-btn').forEach(function (b) {
        b.addEventListener('click', function () {
            photoView.cols = parseInt(this.getAttribute('data-cols'), 10);
            applyPhotoView();
        });
    });
}

function applyPhotoView() {
    var arrange = photoView.mode === 'arrange';
    var cats = photoCategories();
    // "All" isn't a view the live site has, so Arrange always shows one category.
    if (arrange && photoView.category === 'all' && cats.length) photoView.category = cats[0].key;

    document.querySelectorAll('.view-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-view') === photoView.mode);
    });
    document.querySelectorAll('.cat-btn').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-cat') === photoView.category);
        if (b.classList.contains('cat-all')) b.classList.toggle('hidden', arrange);
    });
    document.querySelectorAll('.cols-btn').forEach(function (b) {
        b.classList.toggle('active', parseInt(b.getAttribute('data-cols'), 10) === photoView.cols);
    });
    $('arrangeColsPick').classList.toggle('hidden', !arrange);
    $('arrangeHelp').classList.toggle('hidden', !arrange);
    $('photoList').classList.toggle('hidden', arrange);
    $('arrangeGrid').classList.toggle('hidden', !arrange);
    var wrap = document.querySelector('.wrap');
    if (wrap) wrap.classList.toggle('wide', arrange);

    // Filter the list rows to the chosen category.
    document.querySelectorAll('#photoList .photo-row').forEach(function (row) {
        var show = photoView.category === 'all' || row.getAttribute('data-category') === photoView.category;
        row.classList.toggle('hidden', !show);
    });

    if (arrange) renderArrangeGrid();
}

/* Filenames of the chosen category, in the list's current order. */
function categoryOrder(cat) {
    var out = [];
    document.querySelectorAll('#photoList .photo-row').forEach(function (row) {
        if (row.getAttribute('data-category') === cat) out.push(row.getAttribute('data-filename'));
    });
    return out;
}

/* Lay the category out the way the live Portfolio page does. The site uses
   Masonry, which places each photo in turn at the top of whichever column is
   currently shortest (the leftmost one on a tie). We do the same sums here
   from each photo's shape, so the preview matches the live page. */
var arrangeRatios = {};   // filename -> height / width of its thumbnail

function renderArrangeGrid() {
    var grid = $('arrangeGrid');
    var cols = photoView.cols;
    var order = categoryOrder(photoView.category);
    grid.style.setProperty('--cols', cols);
    if (!order.length) {
        grid.innerHTML = '<p class="help">No photos in this category yet.</p>';
        return;
    }

    // Work out each photo's shape first (only needed once per photo).
    var missing = order.filter(function (fn) { return !arrangeRatios[fn]; });
    if (missing.length) {
        grid.innerHTML = '<p class="help">Loading photos…</p>';
        var left = missing.length;
        var cat = photoView.category;
        missing.forEach(function (fn) {
            var img = new Image();
            img.onload = img.onerror = function () {
                arrangeRatios[fn] = (img.naturalWidth && img.naturalHeight)
                    ? img.naturalHeight / img.naturalWidth : 2 / 3;
                if (--left === 0 && photoView.mode === 'arrange' && photoView.category === cat) {
                    renderArrangeGrid();
                }
            };
            img.src = imgSrc(fn);
        });
        return;
    }

    var GUTTER = 14;
    var colW = (grid.clientWidth - GUTTER * (cols - 1)) / cols;
    var heights = [], stacks = [];
    for (var c = 0; c < cols; c++) { heights.push(0); stacks.push([]); }
    order.forEach(function (fn, i) {
        var shortest = heights.indexOf(Math.min.apply(Math, heights));
        stacks[shortest].push(i);
        heights[shortest] += colW * arrangeRatios[fn] + GUTTER;
    });

    grid.innerHTML = stacks.map(function (stack) {
        return '<div class="arrange-col">' + stack.map(function (i) {
            var fn = order[i];
            var p = state.byFilename[fn] || { title: fn };
            return '<div class="arrange-item" data-filename="' + escapeHtml(fn) + '">' +
                '<img src="' + imgSrc(fn) + '" alt="" draggable="false">' +
                '<span class="arrange-num">' + (i + 1) + '</span>' +
                '<span class="arrange-title">' + escapeHtml(p.title) + '</span>' +
            '</div>';
        }).join('') + '</div>';
    }).join('');

    if (typeof Sortable === 'undefined') return;
    grid.querySelectorAll('.arrange-col').forEach(function (col) {
        Sortable.create(col, {
            group: 'arrange',
            animation: 150,
            delay: 150,
            delayOnTouchOnly: true,
            onEnd: arrangeDropped
        });
    });
}

/* After a drop, the photo takes the place of the one it was dropped in front
   of (everything from there shifts along by one), or goes just after the one
   above it if dropped at the bottom of a column. Then redraw so the preview
   shows exactly what the live page will. */
function arrangeDropped(evt) {
    var fn = evt.item.getAttribute('data-filename');
    var order = categoryOrder(photoView.category);
    var before = order.join('|');
    var next = evt.item.nextElementSibling;
    var prev = evt.item.previousElementSibling;

    order.splice(order.indexOf(fn), 1);
    if (next) {
        order.splice(order.indexOf(next.getAttribute('data-filename')), 0, fn);
    } else if (prev) {
        order.splice(order.indexOf(prev.getAttribute('data-filename')) + 1, 0, fn);
    } else {
        order.push(fn);
    }

    if (order.join('|') !== before) {
        applyCategoryOrder(photoView.category, order);
        flashSave('Order changed — click "Save changes" to publish.', 'ok');
    }
    renderArrangeGrid();
}

/* Put this category's rows into the given order, keeping them in the same
   slots of the full list so other categories are untouched. */
function applyCategoryOrder(cat, order) {
    var list = $('photoList');
    var rows = Array.prototype.slice.call(list.querySelectorAll('.photo-row'));
    var byFn = {};
    rows.forEach(function (row) { byFn[row.getAttribute('data-filename')] = row; });
    var next = 0;
    rows.map(function (row) {
        return row.getAttribute('data-category') === cat ? byFn[order[next++]] : row;
    }).forEach(function (row) { list.appendChild(row); });
}

function imgSrc(filename) {
    // Read thumbnails straight from GitHub's raw view of the test branch.
    return 'https://raw.githubusercontent.com/' + CONFIG.owner + '/' + CONFIG.repo +
           '/' + CONFIG.branch + '/images/Thumb/' + encodeURIComponent(filename);
}

function updateFeaturedCount() {
    var el = document.querySelector('.featured-count');
    if (el) el.textContent = state.featured.length + ' / ' + MAX_FEATURED + ' featured';
}

/* The strip showing the featured photos in their home-page (left-to-right)
   order, with arrows to rearrange. Re-renders in place so it never disturbs an
   unsaved reorder of the main photo list. */
function renderFeaturedStrip() {
    var strip = $('featuredStrip');
    if (!strip) return;
    if (!state.featured.length) {
        strip.innerHTML = '<span class="help">No featured photos yet — star up to ' +
                          MAX_FEATURED + ' photos in the list below.</span>';
        return;
    }
    strip.innerHTML = state.featured.map(function (fn, i) {
        var p = state.byFilename[fn];
        return '<div class="feat-item">' +
            '<button class="feat-left" data-i="' + i + '" title="Move left"' + (i === 0 ? ' disabled' : '') + '>◀</button>' +
            '<img src="' + imgSrc(fn) + '" alt="">' +
            '<span class="feat-title">' + escapeHtml(p ? p.title : fn) + '</span>' +
            '<button class="feat-right" data-i="' + i + '" title="Move right"' + (i === state.featured.length - 1 ? ' disabled' : '') + '>▶</button>' +
        '</div>';
    }).join('');

    strip.querySelectorAll('.feat-left').forEach(function (b) {
        b.addEventListener('click', function () { moveFeatured(parseInt(this.getAttribute('data-i'), 10), -1); });
    });
    strip.querySelectorAll('.feat-right').forEach(function (b) {
        b.addEventListener('click', function () { moveFeatured(parseInt(this.getAttribute('data-i'), 10), 1); });
    });
}

function moveFeatured(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= state.featured.length) return;
    var t = state.featured[i]; state.featured[i] = state.featured[j]; state.featured[j] = t;
    renderFeaturedStrip();
    flashSave('Featured order changed — click "Save changes" to publish.', 'ok');
}

function wirePhotoEvents() {
    $('addPhotoBtn').addEventListener('click', toggleAddForm);
    $('savePhotosBtn').addEventListener('click', savePhotos);

    document.querySelectorAll('.photo-row').forEach(function (row) {
        var fn = row.getAttribute('data-filename');
        row.querySelector('.up').addEventListener('click', function () { moveRow(row, -1); });
        row.querySelector('.down').addEventListener('click', function () { moveRow(row, 1); });
        row.querySelector('.star').addEventListener('click', function () { toggleFeatured(fn, this); });
        row.querySelector('.photo-edit').addEventListener('click', function () { openPhotoEdit(fn); });
        row.querySelector('.remove').addEventListener('click', function () { removePhoto(fn, row); });
    });
}

/* Move a row up (-1) or down (+1) in the list. */
function moveRow(row, dir) {
    // Step over rows hidden by the category filter, so ▲▼ move past the
    // neighbouring photo you can actually see.
    var list = row.parentNode;
    var sib = dir === -1 ? 'previousElementSibling' : 'nextElementSibling';
    var target = row[sib];
    while (target && target.classList.contains('hidden')) target = target[sib];
    if (!target) return;
    if (dir === -1) list.insertBefore(row, target);
    else list.insertBefore(row, target.nextElementSibling);
    row.scrollIntoView({ block: 'nearest' });
}

function toggleFeatured(filename, btn) {
    var idx = state.featured.indexOf(filename);
    if (idx !== -1) {
        state.featured.splice(idx, 1);
        btn.classList.remove('active');
    } else {
        if (state.featured.length >= MAX_FEATURED) {
            flashSave('You can feature at most ' + MAX_FEATURED + ' photos. Un-star one first.', 'error');
            return;
        }
        state.featured.push(filename);
        btn.classList.add('active');
    }
    updateFeaturedCount();
    renderFeaturedStrip();
}

/* Where else a portfolio photo is used. Blog posts and projects reference
   portfolio photos by their images/Thumb/ path rather than copying them, so
   deleting the photo would leave a broken image behind. */
function photoUsage(filename) {
    var ref = 'images/Thumb/' + filename;
    var used = [];
    [['blog', 'blog post'], ['projects', 'project']].forEach(function (pair) {
        (state.content[pair[0]] || []).forEach(function (item) {
            var hit = (item.blocks || []).some(function (b) { return b.src === ref; }) ||
                      item.cover === filename || item.cover === ref;
            if (hit) used.push(pair[1] + ' "' + (item.title || 'untitled') + '"');
        });
    });
    return used;
}

function removePhoto(filename, row) {
    var used = photoUsage(filename);
    if (used.length) {
        if (!confirm('"' + filename + '" is used by ' + used.join(' and ') + '.' +
                     '\n\n' +
                     'Removing it will leave a broken image there. Remove it anyway?')) return;
    }
    if (!confirm('Remove "' + filename + '" from the site? (You can undo via version history.)')) return;
    row.parentNode.removeChild(row);
    var fi = state.featured.indexOf(filename);
    if (fi !== -1) { state.featured.splice(fi, 1); updateFeaturedCount(); }
    row.setAttribute('data-removed', '1'); // marker (row already detached)
    // Track deletion for the next save
    pendingDeletes[filename] = true;
    flashSave('Marked "' + filename + '" for removal. Click "Save changes" to apply.', 'ok');
}

var pendingDeletes = {};


/* ----------------------------------------------------------
   BUILD updated content from the current on-screen order/stars
   ---------------------------------------------------------- */

function buildContentFromDOM() {
    var rows = document.querySelectorAll('#photoList .photo-row');
    var portfolio = [];
    Array.prototype.forEach.call(rows, function (row) {
        var fn = row.getAttribute('data-filename');
        var photo = state.byFilename[fn];
        if (photo) {
            photo.featured = state.featured.indexOf(fn) !== -1;
            portfolio.push(photo);
        }
    });
    var content = Object.assign({}, state.content);
    content.portfolio = portfolio;
    content.featured_images = state.featured.slice(0, MAX_FEATURED);
    return content;
}

function contentToBase64(content) {
    return b64EncodeUnicode(JSON.stringify(content, null, 2) + '\n');
}


/* ----------------------------------------------------------
   SAVE (reorder / remove / featured changes) — content.json only
   ---------------------------------------------------------- */

function savePhotos() {
    var btn = $('savePhotosBtn');
    btn.disabled = true;
    flashSave('Saving…', 'ok');

    var content = buildContentFromDOM();
    var deletes = [];
    Object.keys(pendingDeletes).forEach(function (fn) {
        deletes.push('images/Thumb/' + fn);
        deletes.push('images/Full res/' + fn);
    });

    commitChanges({
        message: 'Update photos (order / featured / removals) via Site Manager',
        upserts: [{ path: 'content.json', base64: contentToBase64(content) }],
        deletes: deletes
    }).then(function () {
        pendingDeletes = {};
        return loadContent();
    }).then(function () {
        flashSave('✓ Saved. The site will update within about a minute.', 'ok');
    }).catch(function (err) {
        flashSave('Could not save: ' + err.message, 'error');
    }).then(function () {
        var b = $('savePhotosBtn'); if (b) b.disabled = false;
    });
}

function flashSave(msg, type) {
    var el = $('saveStatus');
    if (el) showStatus(el, msg, type);
}


/* ----------------------------------------------------------
   ADD PHOTO
   ---------------------------------------------------------- */

function toggleAddForm() {
    var holder = $('addFormHolder');
    if (holder.innerHTML) { holder.innerHTML = ''; return; }

    var cameras = distinctValues(state.content.portfolio, 'camera');
    var lenses  = distinctValues(state.content.portfolio, 'lens');

    holder.innerHTML =
        '<div class="add-form">' +
            '<div class="af-row"><label>Photo file (full resolution)</label>' +
                '<input type="file" id="afFile" accept="image/jpeg,image/png"></div>' +
            '<div class="af-preview" id="afPreview"></div>' +
            '<div class="af-grid">' +
                field('afTitle', 'Title', 'text') +
                '<div class="af-field"><label for="afCategory">Category</label>' +
                    '<select id="afCategory">' + categoryOptions() + '</select></div>' +
                listField('afCamera', 'Camera', cameras) +
                listField('afLens', 'Lens', lenses) +
                field('afFocal', 'Focal length', 'text') +
                field('afShutter', 'Shutter', 'text') +
                field('afAperture', 'Aperture', 'text') +
                field('afIso', 'ISO', 'text') +
                field('afDate', 'Date', 'text') +
            '</div>' +
            '<label class="af-check"><input type="checkbox" id="afFeatured"> Show on home page (featured)</label>' +
            '<div class="af-actions">' +
                '<button id="afSubmit">Add photo &amp; save</button>' +
                '<button class="secondary" id="afCancel">Cancel</button>' +
            '</div>' +
            '<div class="status hidden" id="afStatus"></div>' +
        '</div>';

    $('afFile').addEventListener('change', onAddFileChosen);
    $('afSubmit').addEventListener('click', submitAddPhoto);
    $('afCancel').addEventListener('click', toggleAddForm);
}

function field(id, label, type) {
    return '<div class="af-field"><label for="' + id + '">' + label + '</label>' +
           '<input type="' + type + '" id="' + id + '"></div>';
}
function selectField(id, label, opts) {
    return '<div class="af-field"><label for="' + id + '">' + label + '</label><select id="' + id + '">' +
        opts.map(function (o) { return '<option value="' + o + '">' + o + '</option>'; }).join('') +
        '</select></div>';
}
function listField(id, label, opts) {
    return '<div class="af-field"><label for="' + id + '">' + label + '</label>' +
        '<input type="text" id="' + id + '" list="' + id + 'List">' +
        '<datalist id="' + id + 'List">' +
        opts.map(function (o) { return '<option value="' + escapeHtml(o) + '">'; }).join('') +
        '</datalist></div>';
}

/* Same as field/listField but pre-filled with a value (used by the edit form). */
function fieldV(id, label, val) {
    return '<div class="af-field"><label for="' + id + '">' + label + '</label>' +
           '<input type="text" id="' + id + '" value="' + escapeHtml(val || '') + '"></div>';
}
function listFieldV(id, label, opts, val) {
    return '<div class="af-field"><label for="' + id + '">' + label + '</label>' +
        '<input type="text" id="' + id + '" list="' + id + 'List" value="' + escapeHtml(val || '') + '">' +
        '<datalist id="' + id + 'List">' +
        opts.map(function (o) { return '<option value="' + escapeHtml(o) + '">'; }).join('') +
        '</datalist></div>';
}

var chosenFile = null;

function onAddFileChosen(e) {
    chosenFile = e.target.files[0];
    if (!chosenFile) return;

    // Preview
    var preview = $('afPreview');
    preview.innerHTML = '<img src="' + URL.createObjectURL(chosenFile) + '" alt="preview">';

    // Auto-fill from EXIF
    readExif(chosenFile).then(function (meta) {
        if (meta.camera && !$('afCamera').value) $('afCamera').value = meta.camera;
        if (meta.lens && !$('afLens').value)     $('afLens').value = meta.lens;
        setIfEmpty('afFocal', meta.focal);
        setIfEmpty('afShutter', meta.shutter);
        setIfEmpty('afAperture', meta.aperture);
        setIfEmpty('afIso', meta.iso);
        setIfEmpty('afDate', meta.date);
    });
}

function setIfEmpty(id, val) { var el = $(id); if (el && !el.value && val) el.value = val; }

function submitAddPhoto() {
    var status = $('afStatus');
    if (!chosenFile) { showStatus(status, 'Please choose a photo file first.', 'error'); return; }
    var title = $('afTitle').value.trim();
    if (!title) { showStatus(status, 'Please give the photo a title.', 'error'); return; }

    var category = $('afCategory').value;
    var featured = $('afFeatured').checked;
    var filename = uniqueFilename(slugify(title), '.jpg', state.byFilename);

    var submit = $('afSubmit');
    submit.disabled = true;
    showStatus(status, 'Preparing image…', 'ok');

    var fullB64, thumbB64;

    fileToBase64(chosenFile)
        .then(function (b64) { fullB64 = b64; return makeThumb(chosenFile, THUMB_MAX_EDGE); })
        .then(function (thumbBlob) { return fileToBase64(thumbBlob); })
        .then(function (b64) {
            thumbB64 = b64;
            showStatus(status, 'Saving to your site…', 'ok');

            // Insert new photo at the TOP of the current on-screen list, keeping
            // any pending reorder/removal/featured changes.
            var content = buildContentFromDOM();
            var newPhoto = {
                filename: filename, title: title, category: category, featured: featured,
                camera: $('afCamera').value.trim(), lens: $('afLens').value.trim(),
                focal: $('afFocal').value.trim(), shutter: $('afShutter').value.trim(),
                aperture: $('afAperture').value.trim(), iso: $('afIso').value.trim(),
                date: $('afDate').value.trim()
            };
            content.portfolio.unshift(newPhoto);
            if (featured && content.featured_images.length < MAX_FEATURED) {
                content.featured_images.push(filename);
            }

            var deletes = [];
            Object.keys(pendingDeletes).forEach(function (fn) {
                deletes.push('images/Thumb/' + fn);
                deletes.push('images/Full res/' + fn);
            });

            return commitChanges({
                message: 'Add photo "' + title + '" via Site Manager',
                upserts: [
                    { path: 'images/Full res/' + filename, base64: fullB64 },
                    { path: 'images/Thumb/' + filename,     base64: thumbB64 },
                    { path: 'content.json',                 base64: contentToBase64(content) }
                ],
                deletes: deletes
            });
        })
        .then(function () {
            pendingDeletes = {};
            chosenFile = null;
            return loadContent();
        })
        .then(function () {
            flashSave('✓ Added "' + title + '". The site will update within about a minute.', 'ok');
        })
        .catch(function (err) {
            showStatus(status, 'Could not add photo: ' + err.message, 'error');
            submit.disabled = false;
        });
}


/* ----------------------------------------------------------
   EDIT PHOTO INFO (title / category / EXIF — no image change)
   The filename stays fixed; only the data in content.json changes.
   ---------------------------------------------------------- */

function openPhotoEdit(filename) {
    var p = state.byFilename[filename];
    if (!p) return;
    var cameras = distinctValues(state.content.portfolio, 'camera');
    var lenses  = distinctValues(state.content.portfolio, 'lens');

    $('addFormHolder').innerHTML =
        '<div class="add-form">' +
            '<h3 class="edit-head">Edit “' + escapeHtml(p.title) + '”</h3>' +
            '<div class="af-grid">' +
                fieldV('epTitle', 'Title', p.title) +
                '<div class="af-field"><label for="epCategory">Category</label>' +
                    '<select id="epCategory">' + categoryOptions(p.category) + '</select></div>' +
                listFieldV('epCamera', 'Camera', cameras, p.camera) +
                listFieldV('epLens', 'Lens', lenses, p.lens) +
                fieldV('epFocal', 'Focal length', p.focal) +
                fieldV('epShutter', 'Shutter', p.shutter) +
                fieldV('epAperture', 'Aperture', p.aperture) +
                fieldV('epIso', 'ISO', p.iso) +
                fieldV('epDate', 'Date', p.date) +
            '</div>' +
            '<div class="af-actions">' +
                '<button id="epSave">Save changes</button>' +
                '<button class="secondary" id="epCancel">Cancel</button>' +
            '</div>' +
            '<div class="status hidden" id="epStatus"></div>' +
        '</div>';

    $('epSave').addEventListener('click', function () { submitPhotoEdit(filename); });
    $('epCancel').addEventListener('click', function () { $('addFormHolder').innerHTML = ''; });
    $('addFormHolder').scrollIntoView({ block: 'nearest' });
}

function submitPhotoEdit(filename) {
    var p = state.byFilename[filename];
    if (!p) return;
    var status = $('epStatus');
    var title = $('epTitle').value.trim();
    if (!title) { showStatus(status, 'Title cannot be empty.', 'error'); return; }

    p.title    = title;
    p.category = $('epCategory').value;
    p.camera   = $('epCamera').value.trim();
    p.lens     = $('epLens').value.trim();
    p.focal    = $('epFocal').value.trim();
    p.shutter  = $('epShutter').value.trim();
    p.aperture = $('epAperture').value.trim();
    p.iso      = $('epIso').value.trim();
    p.date     = $('epDate').value.trim();

    $('epSave').disabled = true;
    showStatus(status, 'Saving…', 'ok');

    var content = buildContentFromDOM();   // preserves order/featured; picks up edited p
    commitChanges({
        message: 'Edit photo "' + title + '" via Site Manager',
        upserts: [{ path: 'content.json', base64: contentToBase64(content) }]
    }).then(function () {
        return loadContent();
    }).then(function () {
        flashSave('✓ Updated “' + title + '”. The site will update within about a minute.', 'ok');
    }).catch(function (err) {
        showStatus(status, 'Could not save: ' + err.message, 'error');
        if ($('epSave')) $('epSave').disabled = false;
    });
}


/* ----------------------------------------------------------
   CATEGORIES
   The portfolio filter buttons. Stored in content.json as
   categories: [{ key, label }]. Photos reference a category key;
   keys are immutable so renaming a label never disturbs photos.
   ---------------------------------------------------------- */

function catFlash(msg, type) { var el = $('catStatus'); if (el) showStatus(el, msg, type); }

function categoryUsageCount(key) {
    return (state.content.portfolio || []).filter(function (p) { return p.category === key; }).length;
}

function loadCategoriesPanel() { ensureCategories(); renderCategoriesPanel(); }

function renderCategoriesPanel() {
    var cats = state.content.categories || [];
    var rows = cats.map(function (c, i) {
        var count = c.key ? categoryUsageCount(c.key) : 0;
        return '' +
        '<div class="cat-row" data-index="' + i + '">' +
            '<span class="reorder">' +
                '<button class="up" title="Move up">▲</button>' +
                '<button class="down" title="Move down">▼</button>' +
            '</span>' +
            '<input type="text" class="cat-label" value="' + escapeHtml(c.label) + '" placeholder="Category name">' +
            '<label class="cat-show" title="Untick to keep this category (and its photos) off the Portfolio page">' +
                '<input type="checkbox" class="cat-visible"' + (c.hidden ? '' : ' checked') + '> On Portfolio</label>' +
            '<span class="cat-count">' + count + ' photo' + (count === 1 ? '' : 's') + '</span>' +
            '<button class="cat-remove remove">Remove</button>' +
        '</div>';
    }).join('');

    $('panelBody').innerHTML =
        '<div class="cat-status status hidden" id="catStatus"></div>' +
        '<div class="photo-toolbar">' +
            '<button id="addCatBtn">+ Add category</button>' +
            '<button id="saveCatBtn" class="secondary">Save categories</button>' +
        '</div>' +
        '<div class="cat-list">' + rows + '</div>' +
        '<p class="help">These are the filter buttons on the Portfolio page. Rename by typing; drag order sets ' +
        'button order (the first is shown by default). A category can only be removed once it has no photos in it.</p>' +
        '<p class="help">Photos uploaded inside a project get a category named after that project, and photos ' +
        'uploaded inside any blog post go into one shared “Blog” category. Both start with “On Portfolio” ' +
        'unticked, so they stay off the Portfolio page. Tick it to show them there.</p>';

    $('addCatBtn').addEventListener('click', addCategory);
    $('saveCatBtn').addEventListener('click', saveCategories);
    document.querySelectorAll('.cat-row').forEach(function (row) {
        var i = parseInt(row.getAttribute('data-index'), 10);
        row.querySelector('.up').addEventListener('click', function () { moveCategory(i, -1); });
        row.querySelector('.down').addEventListener('click', function () { moveCategory(i, 1); });
        row.querySelector('.cat-remove').addEventListener('click', function () { removeCategory(i); });
    });
}

/* Read the label inputs back into state before any re-render. */
function syncCategoryInputs() {
    document.querySelectorAll('.cat-row').forEach(function (row) {
        var i = parseInt(row.getAttribute('data-index'), 10);
        var input = row.querySelector('.cat-label');
        var vis = row.querySelector('.cat-visible');
        var cat = state.content.categories[i];
        if (!cat) return;
        if (input) cat.label = input.value;
        if (vis) { if (vis.checked) delete cat.hidden; else cat.hidden = true; }
    });
}

function addCategory() {
    syncCategoryInputs();
    state.content.categories.push({ key: '', label: '' });
    renderCategoriesPanel();
}

function moveCategory(i, dir) {
    syncCategoryInputs();
    var c = state.content.categories, j = i + dir;
    if (j < 0 || j >= c.length) return;
    var t = c[i]; c[i] = c[j]; c[j] = t;
    renderCategoriesPanel();
}

function removeCategory(i) {
    syncCategoryInputs();
    var cat = state.content.categories[i];
    var count = cat.key ? categoryUsageCount(cat.key) : 0;
    if (count > 0) {
        catFlash('“' + (cat.label || 'This category') + '” still has ' + count +
                 ' photo' + (count === 1 ? '' : 's') + '. Move them to another category first (edit each photo).', 'error');
        return;
    }
    state.content.categories.splice(i, 1);
    renderCategoriesPanel();
}

function saveCategories() {
    syncCategoryInputs();
    var cats = state.content.categories;
    var orig = state.catOriginalLabels || {};

    for (var v = 0; v < cats.length; v++) {
        if (!cats[v].label.trim()) { catFlash('Every category needs a name.', 'error'); return; }
    }
    if (!cats.some(function (c) { return !c.hidden; })) {
        catFlash('At least one category needs “On Portfolio” ticked, or the Portfolio page would be empty.', 'error');
        return;
    }

    var used = {};
    cats.forEach(function (c) { if (c.key) used[c.key] = true; });

    cats.forEach(function (c) {
        if (!c.key) {
            // Brand-new category — derive its key from the name.
            c.key = uniqueKey(slugify(c.label), used);
            used[c.key] = true;
        } else if (orig[c.key] !== undefined && orig[c.key] !== c.label) {
            // Renamed — migrate the key (and its photos) to match the new name,
            // leaving untouched categories exactly as they were.
            var desired = slugify(c.label);
            if (desired && desired !== c.key) {
                delete used[c.key];
                var newKey = uniqueKey(desired, used);
                migratePhotoCategory(c.key, newKey);
                c.key = newKey;
                used[newKey] = true;
            }
        }
    });

    $('saveCatBtn').disabled = true;
    catFlash('Saving…', 'ok');
    commitChanges({
        message: 'Update categories via Site Manager',
        upserts: [{ path: 'content.json', base64: contentToBase64(state.content) }]
    }).then(function () {
        return loadContent();
    }).then(function () {
        catFlash('✓ Saved. The site will update within about a minute.', 'ok');
    }).catch(function (err) {
        catFlash('Could not save: ' + err.message, 'error');
    }).then(function () {
        if ($('saveCatBtn')) $('saveCatBtn').disabled = false;
    });
}


/* ----------------------------------------------------------
   HERO / HOME PAGE
   The active hero image is baked into index.html (preload + fade-in
   script) and style.css (background) for fast, flash-free loading.
   Selecting a hero rewrites all of those; the text-position buttons
   rewrite a class on the .hero section.
   ---------------------------------------------------------- */

function heroSrc(name) {
    return 'https://raw.githubusercontent.com/' + CONFIG.owner + '/' + CONFIG.repo +
           '/' + CONFIG.branch + '/images/Hero/' + encodeURIComponent(name);
}

function heroFlash(msg, type) {
    var el = $('heroStatus');
    if (el) showStatus(el, msg, type);
}

/* List the files in a repo folder. */
function ghListDir(path) {
    var url = API + '/repos/' + CONFIG.owner + '/' + CONFIG.repo +
              '/contents/' + encodeURIComponent(path).replace(/%2F/g, '/') +
              '?ref=' + encodeURIComponent(CONFIG.branch) + '&t=' + Date.now();
    return fetch(url, { headers: ghHeaders() }).then(function (res) {
        if (!res.ok) throw new Error('Could not list ' + path + ' (' + res.status + ').');
        return res.json();
    });
}

function loadHeroPanel() {
    var body = $('panelBody');
    body.innerHTML = '<div class="placeholder">Loading hero images…</div>';

    var activeHero = '', activePos = 'right';
    ghGetFile('index.html').then(function (f) {
        var m = f.text.match(/images\/Hero\/([^"'\s)]+)/);
        if (m) activeHero = m[1];
        var pm = f.text.match(/class="hero(?: text-(left|right|center))?"/);
        if (pm && pm[1]) activePos = pm[1];
        return ghListDir('images/Hero');
    }).then(function (files) {
        var imgs = files.filter(function (f) { return /\.(jpe?g|png)$/i.test(f.name); });
        renderHeroPanel(imgs, activeHero, activePos);
    }).catch(function (err) {
        body.innerHTML = '<div class="status error">' + err.message + '</div>';
    });
}

function posRadio(val, cur) {
    return '<label><input type="radio" name="heropos" value="' + val + '"' +
           (cur === val ? ' checked' : '') + '> ' + val + '</label>';
}

function renderHeroPanel(imgs, active, pos) {
    var cards = imgs.map(function (f) {
        var isActive = f.name === active;
        return '' +
        '<div class="hero-card ' + (isActive ? 'active' : '') + '" data-name="' + escapeHtml(f.name) + '">' +
            '<img src="' + heroSrc(f.name) + '" alt="" loading="lazy">' +
            '<div class="hero-card-foot">' +
                (isActive
                    ? '<span class="hero-active">● Live hero</span>'
                    : '<button class="hero-select">Use this</button>') +
                '<button class="hero-remove"' + (isActive ? ' disabled title="Can\'t remove the live hero"' : '') + '>Remove</button>' +
            '</div>' +
        '</div>';
    }).join('');

    $('panelBody').innerHTML =
        '<div class="hero-status status hidden" id="heroStatus"></div>' +
        '<div class="hero-toolbar">' +
            '<label class="btn-like">+ Add hero shot' +
                '<input type="file" id="heroFile" accept="image/jpeg,image/png" hidden></label>' +
            '<div class="hero-pos"><span>Text position:</span>' +
                posRadio('left', pos) + posRadio('center', pos) + posRadio('right', pos) +
            '</div>' +
        '</div>' +
        '<div class="hero-grid">' + cards + '</div>' +
        '<p class="help">The hero is the big image on your home page. “Use this” makes one live; the ' +
        'text-position buttons move your name/tagline so it doesn’t sit on top of your subject. Fine ' +
        'framing tweaks can still come to me.</p>';

    $('heroFile').addEventListener('change', onHeroFileChosen);
    document.querySelectorAll('.hero-pos input').forEach(function (r) {
        r.addEventListener('change', function () { setHeroPosition(this.value); });
    });
    document.querySelectorAll('.hero-card').forEach(function (card) {
        var name = card.getAttribute('data-name');
        var sel = card.querySelector('.hero-select');
        if (sel) sel.addEventListener('click', function () { selectHero(name); });
        var rem = card.querySelector('.hero-remove');
        if (rem && !rem.disabled) rem.addEventListener('click', function () { removeHero(name); });
    });
}

function selectHero(fn) {
    heroFlash('Switching hero…', 'ok');
    Promise.all([ghGetFile('index.html'), ghGetFile('css/style.css')]).then(function (res) {
        var idx = res[0].text.replace(/images\/Hero\/[^"'\s)]+/g, 'images/Hero/' + fn);
        var css = res[1].text.replace(/images\/Hero\/[^"'\s)]+/g, 'images/Hero/' + fn);
        return commitChanges({
            message: 'Set hero image to ' + fn + ' via Site Manager',
            upserts: [
                { path: 'index.html',   base64: b64EncodeUnicode(idx) },
                { path: 'css/style.css', base64: b64EncodeUnicode(css) }
            ]
        });
    }).then(function () {
        heroFlash('✓ Hero updated. Live within about a minute.', 'ok');
        loadHeroPanel();
    }).catch(function (err) { heroFlash('Could not switch hero: ' + err.message, 'error'); });
}

function setHeroPosition(pos) {
    heroFlash('Updating text position…', 'ok');
    ghGetFile('index.html').then(function (f) {
        var idx = f.text.replace(/class="hero(?: text-(?:left|right|center))?"/, 'class="hero text-' + pos + '"');
        return commitChanges({
            message: 'Set hero text position to ' + pos + ' via Site Manager',
            upserts: [{ path: 'index.html', base64: b64EncodeUnicode(idx) }]
        });
    }).then(function () {
        heroFlash('✓ Text moved to the ' + pos + '. Live within about a minute.', 'ok');
    }).catch(function (err) { heroFlash('Could not update: ' + err.message, 'error'); });
}

function onHeroFileChosen(e) {
    var file = e.target.files[0];
    if (!file) return;
    var base = slugify(file.name.replace(/\.[^.]+$/, ''));
    var name = base + '.jpg';
    heroFlash('Uploading “' + name + '”…', 'ok');
    fileToBase64(file).then(function (b64) {
        return commitChanges({
            message: 'Add hero shot ' + name + ' via Site Manager',
            upserts: [{ path: 'images/Hero/' + name, base64: b64 }]
        });
    }).then(function () {
        heroFlash('✓ Added. Click “Use this” under it to make it your home page hero.', 'ok');
        loadHeroPanel();
    }).catch(function (err) { heroFlash('Could not add: ' + err.message, 'error'); });
}

function removeHero(fn) {
    if (!confirm('Remove hero image "' + fn + '"? (Recoverable from version history.)')) return;
    heroFlash('Removing…', 'ok');
    commitChanges({
        message: 'Remove hero shot ' + fn + ' via Site Manager',
        deletes: ['images/Hero/' + fn]
    }).then(function () {
        heroFlash('✓ Removed.', 'ok');
        loadHeroPanel();
    }).catch(function (err) { heroFlash('Could not remove: ' + err.message, 'error'); });
}


/* ----------------------------------------------------------
   BLOG
   Posts live in content.json (blog array): { title, date, body, images:[] }.
   Body text supports blank-line-separated paragraphs. Blog images are
   resized and stored in images/Blog/.
   ---------------------------------------------------------- */

/* The block editor is shared by blog posts and projects. While a form is open:
   { kind: 'blog' | 'project', index: null for new, blocks: [...] }  */
var editForm = null;

/* Where a block editor's uploaded images are stored, per kind. */
var BLOCK_IMAGE_DIRS = { blog: 'images/Blog/', project: 'images/Projects/' };

function blockImageDir() {
    return BLOCK_IMAGE_DIRS[(editForm && editForm.kind) || 'blog'];
}

function blogSrc(fn) {
    return 'https://raw.githubusercontent.com/' + CONFIG.owner + '/' + CONFIG.repo +
           '/' + CONFIG.branch + '/images/Blog/' + encodeURIComponent(fn);
}

/* Raw GitHub URL for any repo-relative path (handles spaces in folders/names). */
function rawSrc(path) {
    return 'https://raw.githubusercontent.com/' + CONFIG.owner + '/' + CONFIG.repo +
           '/' + CONFIG.branch + '/' + path.split('/').map(encodeURIComponent).join('/');
}
function blogFlash(msg, type) { var el = $('blogStatus'); if (el) showStatus(el, msg, type); }

function loadBlogPanel() {
    if (!state.content.blog) state.content.blog = [];
    renderBlogPanel();
}

/* Thumbnail URL for a post's first photo (any block format), or null. */
function firstPostImage(post) {
    var blocks = post.blocks || [];
    for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        if (b.slides && b.slides[0] && b.slides[0].src) return rawSrc(b.slides[0].src);
        if (b.type === 'banner' && b.src) return rawSrc(b.src);
        if (b.type !== 'image') continue;
        if (b.src) return rawSrc(b.src);
        if (b.filename) return blogSrc(b.filename);
    }
    return (post.images && post.images[0]) ? blogSrc(post.images[0]) : null;
}

function renderBlogPanel() {
    var posts = state.content.blog || [];
    var rows = posts.map(function (post, i) {
        var first = firstPostImage(post);
        var thumb = first ? '<img src="' + first + '" alt="">' : '<div class="noimg">No image</div>';
        return '' +
        '<div class="blog-row" data-index="' + i + '">' +
            '<span class="reorder">' +
                '<button class="up" title="Move up">▲</button>' +
                '<button class="down" title="Move down">▼</button>' +
            '</span>' +
            '<div class="blog-thumb">' + thumb + '</div>' +
            '<div class="blog-rowmeta">' +
                '<span class="blog-rowtitle">' + escapeHtml(post.title || '(untitled)') +
                    (post.status === 'draft' ? ' <span class="badge draft">draft</span>' : '') + '</span>' +
                '<span class="blog-rowdate">' + escapeHtml(post.date || '') + '</span>' +
            '</div>' +
            '<button class="blog-edit">Edit</button>' +
            '<button class="blog-del remove">Delete</button>' +
        '</div>';
    }).join('');

    $('panelBody').innerHTML =
        '<div class="blog-status status hidden" id="blogStatus"></div>' +
        '<div class="photo-toolbar"><button id="newPostBtn">+ New blog post</button></div>' +
        '<div class="post-form-holder" id="postFormHolder"></div>' +
        '<div class="blog-list">' +
            (rows || '<div class="placeholder">No blog posts yet. Click “New blog post” to write one.</div>') +
        '</div>';

    $('newPostBtn').addEventListener('click', function () { openPostForm(null); });
    document.querySelectorAll('.blog-row').forEach(function (row) {
        var i = parseInt(row.getAttribute('data-index'), 10);
        row.querySelector('.up').addEventListener('click', function () { moveBlogPost(i, -1); });
        row.querySelector('.down').addEventListener('click', function () { moveBlogPost(i, 1); });
        row.querySelector('.blog-edit').addEventListener('click', function () { openPostForm(i); });
        row.querySelector('.blog-del').addEventListener('click', function () { deletePost(i); });
    });
}

function openPostForm(index) {
    var post = (index === null) ? { title: '', date: formatDate(new Date()), blocks: [] } : state.content.blog[index];
    editForm = {
        kind: 'blog', index: index, blocks: postToEditBlocks(post), layout: editLayoutFor(post),
        sel: null, undo: [], redo: [], view: 'laptop', perRow: 1
    };

    $('postFormHolder').innerHTML =
        '<div class="add-form">' +
            '<div class="af-field"><label for="pfTitle">Title</label>' +
                '<input type="text" id="pfTitle" value="' + escapeHtml(post.title || '') + '"></div>' +
            '<div class="af-grid">' +
                '<div class="af-field"><label for="pfDate">Date</label>' +
                    '<input type="text" id="pfDate" value="' + escapeHtml(post.date || '') + '"></div>' +
                '<div class="af-field"><label for="pfVisibility">Visibility</label>' +
                    '<select id="pfVisibility">' +
                        '<option value="published"' + (post.status !== 'draft' ? ' selected' : '') + '>Published — on the Blog page</option>' +
                        '<option value="draft"' + (post.status === 'draft' ? ' selected' : '') + '>Draft — hidden until you publish it</option>' +
                    '</select></div>' +
            '</div>' +
            layoutEditorHTML('blog') +
            '<div class="af-actions">' +
                '<button id="pfSave">Save post</button>' +
                '<button class="secondary" id="pfPreview" title="Opens the Blog page with drafts shown; it shows what is saved">Preview saved</button>' +
                '<button class="secondary" id="pfCancel">Cancel</button>' +
            '</div>' +
            '<div class="status hidden" id="pfStatus"></div>' +
        '</div>';

    $('pfSave').addEventListener('click', savePost);
    $('pfPreview').addEventListener('click', function () { window.open('/blog.html?preview=1', '_blank'); });
    $('pfCancel').addEventListener('click', function () { closeLayoutEditor('postFormHolder'); });
    initLayoutEditor();
    $('postFormHolder').scrollIntoView({ block: 'nearest' });
}

/* ----------------------------------------------------------
   LAYOUT EDITOR (shared by blog posts and projects)
   A visual canvas laid out the way the live page will be:
   blocks sit in rows, each block is 1–12 twelfths wide, and a
   row wraps onto a new line when it fills up (so 3 photos at
   one-third each make a grid). Drag a block to move it (drop it
   beside another to sit side by side, or on the dashed line
   between rows for a row of its own), drag its right edge to
   resize it, click it for its settings on the right.

   While a form is open editForm holds:
     { kind, index, blocks, layout, sel, undo, redo, view, perRow }
   Each block carries a temporary _id so the canvas can find it;
   new uploads also carry file/previewUrl until they are saved.
   Saved items get layout.v = 2, which tells script.js to use the
   layout renderer; anything older keeps rendering the old way
   until it is next saved from here.
   ---------------------------------------------------------- */

var LE_DEFAULT_LAYOUT = { v: 2, width: 'standard', gap: 'normal', align: 'center', corners: 'rounded', cover: true };
var LE_PAGE_PX = { standard: 800, wide: 1100, full: 1400 };
/* Content width the canvas shows for tablet / phone previews (a 768px tablet
   and a 390px phone, less the page's 2rem side padding). */
var LE_VIEW_PX = { tablet: 704, phone: 326 };
var leSeq = 0;
function leId() { leSeq++; return 'b' + leSeq; }

function leClampW(w) { return Math.max(1, Math.min(12, parseInt(w, 10) || 12)); }

/* Page settings for an item, filling in defaults. */
function editLayoutFor(item) {
    var L = (item && item.layout && item.layout.v === 2) ? item.layout : {};
    var out = {};
    Object.keys(LE_DEFAULT_LAYOUT).forEach(function (k) {
        out[k] = L[k] !== undefined ? L[k] : LE_DEFAULT_LAYOUT[k];
    });
    out.v = 2;
    out.custom = { tablet: !!(L.custom && L.custom.tablet), phone: !!(L.custom && L.custom.phone) };
    return out;
}

/* ---------- screen sizes ----------
   The canvas previews Laptop, Tablet or Phone. By default tablets keep the
   laptop widths and phones stack (small photos two to a line), exactly as
   the live CSS does. Switching a size to "Custom" gives every block its own
   width for that size (tw / pw), set by resizing in that preview. */
function leAutoW(b, view) {
    var w = leClampW(b.w);
    if (view === 'phone') return (b.type === 'image' && w <= 4) ? 6 : 12;
    return w;
}
/* Which width the current preview edits: w, tw, pw, or null when automatic. */
function leWProp() {
    var v = editForm.view, c = editForm.layout.custom || {};
    if (v === 'tablet') return c.tablet ? 'tw' : null;
    if (v === 'phone') return c.phone ? 'pw' : null;
    return 'w';
}
function leEffW(b) {
    var prop = leWProp();
    if (prop && prop !== 'w' && b[prop]) return leClampW(b[prop]);
    return leAutoW(b, editForm.view);
}
var LE_HIDE_KEY = { laptop: 'hideD', tablet: 'hideT', phone: 'hideP' };
var LE_VIEW_NAME = { laptop: 'laptop', tablet: 'tablet', phone: 'phone' };
/* New blocks in a custom size start at that size's automatic width. */
function leFillCustomWidths(blocks) {
    var c = editForm.layout.custom || {};
    blocks.forEach(function (b) {
        if (c.tablet && !b.tw) b.tw = leAutoW(b, 'tablet');
        if (c.phone && !b.pw) b.pw = leAutoW(b, 'phone');
    });
}

/* Build the editable block list for a post or project. Older items (plain
   top-to-bottom blocks, or the very first { body, images } blog format) are
   turned into rows that look as close as possible to how they showed before. */
var LEGACY_IMAGE_W = { small: 4, medium: 7, large: 9, full: 12 };
function postToEditBlocks(post) {
    var raw = post.blocks ? post.blocks : (function () {
        var b = [];
        (post.images || []).forEach(function (fn) { b.push({ type: 'image', filename: fn, size: 'full', align: 'full' }); });
        if (post.body) b.push({ type: 'text', text: post.body });
        return b;
    })();

    if (post.layout && post.layout.v === 2) {
        return raw.map(function (b, i) {
            var c = {};
            Object.keys(b).forEach(function (k) { c[k] = b[k]; });
            c._id = leId();
            c.w = leClampW(b.w);
            c.newRow = i === 0 || !!b.newRow;
            if (c.type === 'image' && !c.src && c.filename) c.src = 'images/Blog/' + c.filename;
            return c;
        });
    }

    var out = [];
    for (var i = 0; i < raw.length; i++) {
        var b = raw[i];
        if (b.type === 'text') {
            out.push({ _id: leId(), type: 'text', text: b.text || '', style: 'body', align: 'left', w: 12, newRow: true });
            continue;
        }
        if (b.type !== 'image') continue;
        var full = b.size === 'full' || b.align === 'full';
        var img = {
            _id: leId(), type: 'image', src: b.src || (b.filename ? 'images/Blog/' + b.filename : ''),
            crop: 'original', caption: '', w: full ? 12 : (LEGACY_IMAGE_W[b.size] || 7), newRow: true
        };
        var next = raw[i + 1];
        // A left/right "wrap" image with text after it becomes image + text side by side.
        if (!full && (b.align === 'left' || b.align === 'right') && next && next.type === 'text') {
            img.w = Math.min(img.w, 6);
            var txt = { _id: leId(), type: 'text', text: next.text || '', style: 'body', align: 'left', w: 12 - img.w, newRow: false };
            if (b.align === 'left') out.push(img, txt);
            else { txt.newRow = true; img.newRow = false; out.push(txt, img); }
            i++;
            continue;
        }
        out.push(img);
    }
    return out;
}

/* The editor's HTML, dropped into the blog/project form. */
function layoutEditorHTML(kind) {
    var note = kind === 'blog'
        ? 'Uploaded photos are also added to your photo library in the shared “Blog” category, kept off the Portfolio page.'
        : 'Uploaded photos are also added to your photo library in a category named after this project, kept off the Portfolio page.';
    return '' +
        '<div class="le" id="layoutEditor">' +
            '<div class="le-bar" id="leBar"></div>' +
            '<div class="le-add">' +
                '<span class="le-add-label">Add</span>' +
                '<button class="secondary" data-add="text">Text</button>' +
                '<button class="secondary" data-add="heading">Heading</button>' +
                '<button class="secondary" data-add="quote">Quote</button>' +
                '<label class="btn-like" title="You can pick several photos at once">Upload photos' +
                    '<input type="file" id="addImageBlock" accept="image/jpeg,image/png" multiple hidden></label>' +
                '<button class="secondary" id="addLibImage">From library</button>' +
                '<label class="le-perrow">Photos per row <select id="lePerRow">' +
                    [1, 2, 3, 4].map(function (n) {
                        return '<option value="' + n + '"' + (n === editForm.perRow ? ' selected' : '') + '>' + n + '</option>';
                    }).join('') +
                '</select></label>' +
                '<select id="leAddMore" class="le-addmore" title="More kinds of block">' +
                    '<option value="">More blocks…</option>' +
                    '<option value="banner">Banner: photo with words over it</option>' +
                    '<option value="gallery">Gallery: photos in columns</option>' +
                    '<option value="carousel">Carousel: slideshow</option>' +
                    '<option value="compare">Before / after slider</option>' +
                    '<option value="button">Button / link</option>' +
                    '<option value="spacer">Empty space</option>' +
                    '<option value="divider">Line</option>' +
                '</select>' +
            '</div>' +
            '<p class="help upload-note">' + note + '</p>' +
            '<div class="library-picker hidden" id="libraryPicker"></div>' +
            '<div class="le-main">' +
                '<div class="le-stage" id="leStage"><div class="le-viewnote hidden" id="leViewNote"></div>' +
                    '<div class="le-canvas" id="leCanvas"></div></div>' +
                '<aside class="le-inspector" id="leInspector"></aside>' +
            '</div>' +
        '</div>';
}

/* Wire up the add bar and keyboard shortcuts once the form is on screen. */
function initLayoutEditor() {
    var wrap = document.querySelector('.wrap');
    if (wrap) wrap.classList.add('editing');
    document.querySelectorAll('#layoutEditor [data-add]').forEach(function (bt) {
        bt.addEventListener('click', function () { leAdd(this.getAttribute('data-add')); });
    });
    $('leAddMore').addEventListener('change', function () {
        var kind = this.value;
        this.value = '';
        if (kind) leAdd(kind);
    });
    $('addImageBlock').addEventListener('change', onBlockImageChosen);
    $('addLibImage').addEventListener('click', function () { openLibraryPicker(); });
    $('lePerRow').addEventListener('change', function () { editForm.perRow = parseInt(this.value, 10) || 1; });
    renderBlocks();
    leOfferBackup();
}

/* Close the editor (Cancel). Asks first if anything was changed. */
function closeLayoutEditor(holderId) {
    if (editForm && editForm.undo.length && !confirm('Discard your unsaved changes?')) return;
    leClearBackup();
    $(holderId).innerHTML = '';
    editForm = null;
    var wrap = document.querySelector('.wrap');
    if (wrap) wrap.classList.remove('editing');
}

document.addEventListener('keydown', function (e) {
    if (!editForm || !$('leCanvas')) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
    var key = (e.key || '').toLowerCase();
    if (key === 'escape' && (editForm.multi || []).length) { leSelect(null); return; }
    if (leKeys(e)) return;
    if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); e.shiftKey ? leRedo() : leUndo(); }
    else if ((e.ctrlKey || e.metaKey) && key === 'y') { e.preventDefault(); leRedo(); }
});

/* ---------- undo ---------- */

function leSnapshot() {
    editForm.undo.push(leState());
    if (editForm.undo.length > 60) editForm.undo.shift();
    editForm.redo = [];
    editForm.typing = null;
}
function leState() {
    return {
        blocks: editForm.blocks.map(function (b) {
            var c = {}; Object.keys(b).forEach(function (k) { c[k] = b[k]; });
            if (b.slides) c.slides = b.slides.map(function (sl) { var o = {}; Object.keys(sl).forEach(function (k) { o[k] = sl[k]; }); return o; });
            ['before', 'after'].forEach(function (k) { if (b[k]) { var o = {}; Object.keys(b[k]).forEach(function (q) { o[q] = b[k][q]; }); c[k] = o; } });
            return c;
        }),
        layout: JSON.parse(JSON.stringify(editForm.layout))
    };
}
function leRestore(s) {
    editForm.blocks = s.blocks;
    editForm.layout = s.layout;
    if (!editForm.blocks.some(function (b) { return b._id === editForm.sel; })) editForm.sel = null;
    renderBlocks();
}
function leUndo() {
    if (!editForm.undo.length) return;
    editForm.redo.push(leState());
    leRestore(editForm.undo.pop());
}
function leRedo() {
    if (!editForm.redo.length) return;
    editForm.undo.push(leState());
    leRestore(editForm.redo.pop());
}

/* ---------- helpers ---------- */

function leRows() {
    var rows = [];
    editForm.blocks.forEach(function (b, i) {
        if (i === 0 || b.newRow) rows.push([]);
        rows[rows.length - 1].push(b);
    });
    return rows;
}
function leIndex(id) {
    for (var i = 0; i < editForm.blocks.length; i++) if (editForm.blocks[i]._id === id) return i;
    return -1;
}
function leSelected() {
    var i = leIndex(editForm.sel);
    return i === -1 ? null : editForm.blocks[i];
}
function leWidthLabel(w) {
    return ({ 12: 'Full', 9: '¾', 8: '⅔', 6: '½', 4: '⅓', 3: '¼' })[w] || (w + '/12');
}
function leImgSrc(b) {
    return b.file ? b.previewUrl : rawSrc(b.src || '');
}
/* Give n blocks equal widths that fill one line. */
function leEqualise(blocks, prop) {
    var n = blocks.length, base = Math.floor(12 / n), rem = 12 - base * n;
    blocks.forEach(function (b, k) { b[prop || 'w'] = Math.max(1, base + (k < rem ? 1 : 0)); });
}

/* ---------- adding ---------- */

function leNewBlock(kind) {
    var b = { _id: leId(), newRow: true, w: 12 };
    if (kind === 'heading') { b.type = 'text'; b.style = 'heading'; b.align = 'left'; b.text = ''; }
    else if (kind === 'quote') { b.type = 'text'; b.style = 'quote'; b.align = 'left'; b.text = ''; }
    else if (kind === 'spacer') { b.type = 'spacer'; b.size = 'm'; }
    else if (kind === 'divider') { b.type = 'divider'; }
    else if (kind === 'carousel') { b.type = 'carousel'; b.crop = 'landscape'; b.slides = []; }
    else if (kind === 'gallery') { b.type = 'gallery'; b.cols = 3; b.slides = []; }
    else if (kind === 'compare') { b.type = 'compare'; b.crop = 'landscape'; b.before = {}; b.after = {}; }
    else if (kind === 'banner') { b.type = 'banner'; b.crop = 'wide'; b.place = 'center'; b.shade = 0.35; b.title = ''; b.text = ''; }
    else if (kind === 'button') { b.type = 'button'; b.label = 'Get in touch'; b.href = '/contact.html'; b.look = 'solid'; b.align = 'center'; }
    else { b.type = 'text'; b.style = 'body'; b.align = 'left'; b.text = ''; }
    return b;
}

/* Put new blocks after the selected block's row (or at the end). With
   joinRow they go straight after the selected block, in its row. */
function leInsert(newBlocks, joinRow) {
    leSnapshot();
    var at = editForm.blocks.length;
    var i = leIndex(editForm.sel);
    if (i !== -1) {
        at = i + 1;
        if (!joinRow) while (at < editForm.blocks.length && !editForm.blocks[at].newRow) at++;
    }
    if (joinRow && i !== -1) newBlocks[0].newRow = false;
    leFillCustomWidths(newBlocks);
    Array.prototype.splice.apply(editForm.blocks, [at, 0].concat(newBlocks));
    editForm.sel = newBlocks[newBlocks.length - 1]._id;
    renderBlocks();
    var cell = document.querySelector('.le-cell[data-id="' + newBlocks[0]._id + '"]');
    if (cell) {
        cell.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        var ta = cell.querySelector('textarea');
        if (ta) ta.focus();
    }
}

function leAdd(kind) { leInsert([leNewBlock(kind)]); }

function leImageBlock(fields, k) {
    var per = editForm.perRow || 1;
    var b = { _id: leId(), type: 'image', crop: 'original', caption: '', w: Math.round(12 / per), newRow: k === 0 };
    Object.keys(fields).forEach(function (key) { b[key] = fields[key]; });
    return b;
}

function onBlockImageChosen(e) {
    var files = Array.prototype.slice.call(e.target.files);
    e.target.value = '';
    if (!files.length) return;
    leInsert(files.map(function (file, k) {
        return leImageBlock({ file: file, previewUrl: URL.createObjectURL(file) }, k);
    }));
}

/* ---------- rendering ---------- */

/* Kept for older callers: the canvas writes edits straight into state. */
function syncBlockInputs() {}

function leSeg(prop, options, current, scope) {
    return '<div class="le-seg">' + options.map(function (o) {
        return '<button type="button" class="le-seg-btn' + (String(o[0]) === String(current) ? ' active' : '') + '"' +
               ' data-' + scope + '="' + prop + '" data-val="' + o[0] + '"' + (o[2] ? ' title="' + o[2] + '"' : '') + '>' + o[1] + '</button>';
    }).join('') + '</div>';
}

function renderLayoutBar() {
    var bar = $('leBar');
    if (!bar) return;
    var L = editForm.layout;
    bar.innerHTML =
        '<div class="le-set"><span>Page width</span>' +
            leSeg('width', [['standard', 'Standard', 'Same width as the text column (800px)'], ['wide', 'Wide', 'Up to 1100px'], ['full', 'Extra wide', 'Up to 1400px']], L.width, 'lprop') + '</div>' +
        '<div class="le-set"><span>Spacing</span>' +
            leSeg('gap', [['none', 'None'], ['tight', 'Tight'], ['normal', 'Normal'], ['roomy', 'Roomy']], L.gap, 'lprop') + '</div>' +
        '<div class="le-set"><span>Rows</span>' +
            leSeg('align', [['center', 'Centred'], ['left', 'Left']], L.align, 'lprop') + '</div>' +
        '<div class="le-set"><span>Corners</span>' +
            leSeg('corners', [['rounded', 'Rounded'], ['square', 'Square']], L.corners, 'lprop') + '</div>' +
        (editForm.kind === 'project'
            ? '<div class="le-set"><span>Cover at top</span>' + leSeg('cover', [['true', 'Show'], ['false', 'Hide']], String(L.cover !== false), 'lprop') + '</div>'
            : '') +
        '<div class="le-set le-set-right"><span>Preview</span>' +
            leSeg('view', [['laptop', 'Laptop'], ['tablet', 'Tablet'], ['phone', 'Phone']], editForm.view, 'view') +
            '<button type="button" class="le-icon" id="leUndo" title="Undo (Ctrl+Z)"' + (editForm.undo.length ? '' : ' disabled') + '>↶</button>' +
            '<button type="button" class="le-icon" id="leRedo" title="Redo (Ctrl+Shift+Z)"' + (editForm.redo.length ? '' : ' disabled') + '>↷</button>' +
        '</div>';

    bar.querySelectorAll('[data-lprop]').forEach(function (bt) {
        bt.addEventListener('click', function () {
            var prop = this.getAttribute('data-lprop'), val = this.getAttribute('data-val');
            if (prop === 'cover') val = val === 'true';
            if (editForm.layout[prop] === val) return;
            leSnapshot();
            editForm.layout[prop] = val;
            renderBlocks();
        });
    });
    bar.querySelectorAll('[data-view]').forEach(function (bt) {
        bt.addEventListener('click', function () { editForm.view = this.getAttribute('data-val'); renderBlocks(); });
    });
    var note = $('leViewNote');
    var v = editForm.view;
    if (v === 'laptop') {
        note.className = 'le-viewnote hidden';
        note.innerHTML = '';
    } else {
        var on = !!(L.custom && L.custom[v]);
        note.className = 'le-viewnote' + (on ? ' le-custom-on' : '');
        note.innerHTML =
            '<div class="le-seg">' +
                '<button type="button" class="le-seg-btn' + (on ? '' : ' active') + '" data-custom="off">Automatic</button>' +
                '<button type="button" class="le-seg-btn' + (on ? ' active' : '') + '" data-custom="on">Custom ' + v + ' layout</button>' +
            '</div>' +
            '<span>' + (on
                ? 'Resizing here only changes the <b>' + v + '</b> layout. Moving blocks, text and photo changes still apply to every size.'
                : (v === 'tablet'
                    ? 'Tablets use your laptop layout automatically. Choose <b>Custom</b> to set different widths for tablets.'
                    : 'Phones stack everything automatically, with small photos two to a line. Choose <b>Custom</b> to set phone widths yourself.')) +
            '</span>';
        note.querySelectorAll('[data-custom]').forEach(function (bt) {
            bt.addEventListener('click', function () { leSetCustom(v, this.getAttribute('data-custom') === 'on'); });
        });
    }
    $('leUndo').addEventListener('click', leUndo);
    $('leRedo').addEventListener('click', leRedo);
}

function leBlockInner(b) {
    var inner = '';
    if (b.type === 'text') {
        var ph = { heading: 'Heading', subheading: 'Subheading', quote: 'A quote…', small: 'Small print…' }[b.style] ||
                 'Write something… (leave a blank line for a new paragraph)';
        inner = '<textarea class="le-text le-st-' + (b.style || 'body') + ' lay-ta-' + (b.align || 'left') + (b.dropcap ? ' le-dropcap' : '') + '" data-id="' + b._id + '" rows="1" placeholder="' + ph + '">' +
                escapeHtml(b.text || '') + '</textarea>';
    } else if (b.type === 'image') {
        inner = '<figure class="lay-figure lay-crop-' + (b.crop || 'original') + '">' +
                    ((b.src || b.file) ? '<img src="' + leImgSrc(b) + '" alt="" draggable="false">' : '<div class="le-slot-empty le-photo-empty">Photo: click, then choose one in the panel →</div>') +
                '</figure>' +
                '<input class="le-caption" data-id="' + b._id + '" value="' + escapeHtml(b.caption || '') + '" placeholder="Add a caption (optional)">' +
                (b.exif && leExifLine(b.src) ? '<div class="le-exif">' + escapeHtml(leExifLine(b.src)) + '</div>' : '');
    } else if (b.type === 'spacer') {
        inner = '<div class="le-spacer lay-sp-' + (b.size || 'm') + '"><span>Space</span></div>';
    } else if (b.type === 'divider') {
        inner = '<div class="le-divider"><hr class="lay-divider"></div>';
    } else if (b.type === 'carousel') {
        inner = leCarouselHTML(b);
    } else if (b.type === 'gallery') {
        inner = leGalleryHTML(b);
    } else if (b.type === 'compare') {
        inner = leCompareHTML(b);
    } else if (b.type === 'banner') {
        inner = leBannerHTML(b);
    } else if (b.type === 'button') {
        inner = leButtonHTML(b);
    }
    return inner;
}

function leCellHTML(b) {
    var inner = leBlockInner(b);
    var w = leEffW(b);
    var hidden = b[LE_HIDE_KEY[editForm.view]];
    return '<div class="lay-cell le-cell le-k-' + b.type + ' lay-v-' + (b.valign || 'top') +
               (hidden ? ' le-hidden' : '') +
               (((editForm.multi || []).length ? editForm.multi.indexOf(b._id) !== -1 : editForm.sel === b._id) ? ' le-sel' : '') +
               '" data-id="' + b._id + '" style="--w:' + w + '">' +
               '<div class="le-tools"><span class="le-grip" title="Drag to move">⠿</span><span class="le-wl">' + leWidthLabel(w) + '</span>' +
                   (hidden ? '<span class="le-wl le-hid">Hidden on ' + editForm.view + '</span>' : '') + '</div>' +
               inner +
               '<div class="le-resize" title="Drag to change the width"></div>' +
           '</div>';
}

/* Draw the canvas, page settings and the settings panel. */
function renderBlocks() {
    var canvas = $('leCanvas');
    if (!canvas || !editForm) return;
    renderLayoutBar();
    var L = editForm.layout;
    var view = editForm.view;
    $('leStage').className = 'le-stage le-view-' + view + (leWProp() ? '' : ' le-auto');
    canvas.className = 'le-canvas lay-gap-' + L.gap + (L.corners === 'square' ? ' lay-square' : '');
    canvas.style.maxWidth = (view === 'laptop' ? LE_PAGE_PX[L.width] : LE_VIEW_PX[view]) + 'px';

    var rows = leRows();
    if (!rows.length) {
        canvas.innerHTML = '<div class="le-empty">Your page is empty. Use the <b>Add</b> buttons above to start ' +
            'with text, a heading or photos — then drag things around and resize them here.' + leTemplatePicker() + '</div>';
        canvas.querySelectorAll('[data-tpl]').forEach(function (bt) {
            bt.addEventListener('click', function () { leApplyTemplate(this.getAttribute('data-tpl')); });
        });
        renderInspector();
        leScheduleBackup();
        return;
    }
    canvas.innerHTML = rows.map(function (row) {
        return '<div class="lay-row le-row lay-row-' + (L.align === 'left' ? 'left' : 'center') + '">' +
               row.map(leCellHTML).join('') + '</div>';
    }).join('');

    canvas.querySelectorAll('.le-cell').forEach(function (cell) {
        var id = cell.getAttribute('data-id');
        cell.addEventListener('pointerdown', leDragDown);
        cell.addEventListener('focusin', function () { leSelect(id); });
    });
    canvas.querySelectorAll('textarea.le-text').forEach(function (ta) {
        var b = editForm.blocks[leIndex(ta.getAttribute('data-id'))];
        ta.addEventListener('input', function () {
            // One undo step per burst of typing in a block.
            if (editForm.typing !== b._id) { leSnapshot(); editForm.typing = b._id; leUndoButtons(); }
            b.text = ta.value;
            leGrow(ta);
            leScheduleBackup();
        });
    });
    canvas.querySelectorAll('input.le-caption').forEach(function (inp) {
        var b = editForm.blocks[leIndex(inp.getAttribute('data-id'))];
        inp.addEventListener('input', function () {
            if (editForm.typing !== b._id + 'c') { leSnapshot(); editForm.typing = b._id + 'c'; leUndoButtons(); }
            b.caption = inp.value;
            var ins = $('leCaptionIns');
            if (ins && editForm.sel === b._id) ins.value = inp.value;
        });
    });
    canvas.querySelectorAll('.le-resize').forEach(function (h) { h.addEventListener('pointerdown', leResizeStart); });
    canvas.querySelectorAll('.le-car-nav').forEach(function (bt) {
        bt.addEventListener('click', function () { leCarouselStep(this.getAttribute('data-car'), +this.getAttribute('data-step')); });
    });
    canvas.querySelectorAll('.le-canvas img').forEach(function (img) {
        img.addEventListener('load', function () { leGrowAll(); });
    });

    requestAnimationFrame(leGrowAll);
    renderInspector();
    leScheduleBackup();
}

function leGrow(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
function leGrowAll() { document.querySelectorAll('#leCanvas textarea.le-text').forEach(leGrow); }
function leUndoButtons() {
    leScheduleBackup();
    if ($('leUndo')) $('leUndo').disabled = !editForm.undo.length;
    if ($('leRedo')) $('leRedo').disabled = !editForm.redo.length;
}

function leSelect(id) {
    if (editForm.sel === id && !(editForm.multi || []).length) return;
    editForm.sel = id;
    editForm.multi = [];
    leMarkSelection();
    renderInspector();
}

/* ---------- selecting several blocks ----------
   Shift- or Ctrl-click (Cmd on a Mac) adds or removes a block from the
   selection. With two or more selected, the panel offers group actions:
   put them side by side, make a grid, give them one width or shape,
   turn photos into a carousel, or remove them. */

function leToggleMulti(id) {
    var m = editForm.multi || [];
    if (!m.length && editForm.sel && editForm.sel !== id) m = [editForm.sel];
    var at = m.indexOf(id);
    if (at === -1) m.push(id); else m.splice(at, 1);
    editForm.multi = m.length > 1 ? m : [];
    editForm.sel = m.length === 1 ? m[0] : (m.length ? id : null);
    leMarkSelection();
    renderInspector();
}

function leMarkSelection() {
    var m = editForm.multi || [];
    document.querySelectorAll('#leCanvas .le-cell').forEach(function (c) {
        var id = c.getAttribute('data-id');
        c.classList.toggle('le-sel', m.length ? m.indexOf(id) !== -1 : id === editForm.sel);
    });
}

/* The selected blocks, in page order. */
function leMultiBlocks() {
    var m = editForm.multi || [];
    return editForm.blocks.filter(function (b) { return m.indexOf(b._id) !== -1; });
}

/* Take the given blocks out and put them back as one row of their own, where
   the first of them was. Works on rows of the block list, so nothing can go
   missing. Returns false if something didn't add up. */
function leGatherRow(group) {
    var before = editForm.blocks.length;
    var rows = leRows(), out = [];
    rows.forEach(function (row) {
        var p = row.indexOf(group[0]);
        var keep = row.filter(function (b) { return group.indexOf(b) === -1; });
        if (p === -1) { if (keep.length) out.push(keep); return; }
        var head = row.slice(0, p).filter(function (b) { return group.indexOf(b) === -1; });
        var tail = row.slice(p).filter(function (b) { return group.indexOf(b) === -1; });
        if (head.length) out.push(head);
        out.push(group.slice());
        if (tail.length) out.push(tail);
    });
    var flat = [];
    out.forEach(function (row) { row.forEach(function (b, k) { b.newRow = k === 0; flat.push(b); }); });
    if (flat.length !== before) return false;
    editForm.blocks = flat;
    return true;
}

function leGroupAction(kind, n) {
    var group = leMultiBlocks();
    if (group.length < 2) return;
    var prop = leWProp() || 'w';
    leSnapshot();
    if (kind === 'row' || kind === 'grid') {
        if (!leGatherRow(group)) { leRestore(editForm.undo.pop()); return; }
        if (kind === 'row') leEqualise(group, prop);
        else group.forEach(function (b) { b[prop] = Math.round(12 / n); });
    } else if (kind === 'width') {
        group.forEach(function (b) { b[prop] = n; });
    } else if (kind === 'crop') {
        group.forEach(function (b) { if (b.type === 'image' || b.type === 'carousel') b.crop = n; });
    } else if (kind === 'valign') {
        group.forEach(function (b) { b.valign = n; });
    } else if (kind === 'carousel' || kind === 'gallery' || kind === 'compare') {
        var photos = group.filter(function (b) { return b.type === 'image'; });
        if (!leGatherRow(photos)) { leRestore(editForm.undo.pop()); return; }
        var asSlide = function (p) {
            var s = { src: p.src, caption: p.caption || '' };
            if (p.file) { s.file = p.file; s.previewUrl = p.previewUrl; }
            return s;
        };
        var car = { _id: leId(), type: kind, newRow: true, w: 12 };
        if (kind === 'compare') { car.crop = 'landscape'; car.before = asSlide(photos[0]); car.after = asSlide(photos[1]); }
        else { car.slides = photos.map(asSlide); if (kind === 'carousel') car.crop = 'landscape'; else car.cols = Math.min(4, Math.max(2, photos.length > 4 ? 3 : photos.length)); }
        leFillCustomWidths([car]);
        var at = editForm.blocks.indexOf(photos[0]);
        editForm.blocks = editForm.blocks.filter(function (b) { return photos.indexOf(b) === -1; });
        editForm.blocks.splice(at, 0, car);
        editForm.multi = [];
        editForm.sel = car._id;
    } else if (kind === 'remove') {
        group.slice().forEach(function (b) {
            var i = editForm.blocks.indexOf(b), nx = editForm.blocks[i + 1];
            if ((b.newRow || i === 0) && nx && !nx.newRow) nx.newRow = true;
            editForm.blocks.splice(i, 1);
        });
        editForm.multi = [];
        editForm.sel = null;
    }
    renderBlocks();
}

function renderMultiInspector(box) {
    var group = leMultiBlocks();
    var photos = group.filter(function (b) { return b.type === 'image'; }).length;
    var wProp = leWProp();
    var h = '<div class="le-ins-title">' + group.length + ' blocks selected</div>' +
        '<p class="help" style="margin-top:-0.4rem">Shift- or Ctrl-click blocks to add or remove them. Click one on its own to go back.</p>';
    h += '<div class="le-field"><label>Arrange</label><div class="le-btncol">' +
         '<button type="button" class="secondary le-small" data-group="row">Side by side in one row</button>' +
         '<div class="le-seg"><span class="le-seg-lbl">Grid</span>' +
             [2, 3, 4].map(function (n) { return '<button type="button" class="le-seg-btn" data-group="grid" data-n="' + n + '">' + n + ' per row</button>'; }).join('') +
         '</div></div>' +
         '<p class="help">They move together to where the first one is, in their current order.</p></div>';
    if (wProp) {
        h += '<div class="le-field"><label>Same width' + (editForm.view === 'laptop' ? '' : ' on ' + editForm.view) + '</label><div class="le-seg">' +
             [[3, '¼'], [4, '⅓'], [6, '½'], [8, '⅔'], [12, 'Full']].map(function (o) {
                 return '<button type="button" class="le-seg-btn" data-group="width" data-n="' + o[0] + '">' + o[1] + '</button>';
             }).join('') + '</div></div>';
    }
    if (photos) {
        h += '<div class="le-field"><label>Same shape</label><div class="le-seg">' +
             [['original', 'Original'], ['square', 'Square'], ['landscape', '3:2'], ['portrait', '4:5'], ['wide', '16:9']].map(function (o) {
                 return '<button type="button" class="le-seg-btn" data-group="crop" data-n="' + o[0] + '">' + o[1] + '</button>';
             }).join('') + '</div></div>';
    }
    h += '<div class="le-field"><label>Line up</label><div class="le-seg">' +
         [['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']].map(function (o) {
             return '<button type="button" class="le-seg-btn" data-group="valign" data-n="' + o[0] + '">' + o[1] + '</button>';
         }).join('') + '</div></div>';
    if (photos >= 2) {
        h += '<div class="le-field"><label>Combine the ' + photos + ' photos into</label><div class="le-btnrow">' +
             '<button type="button" class="le-small" data-group="carousel">A carousel</button>' +
             '<button type="button" class="le-small" data-group="gallery">A gallery</button>' +
             (photos === 2 ? '<button type="button" class="le-small" data-group="compare">Before / after</button>' : '') +
             '</div><p class="help">Only the photos are used; other selected blocks stay as they are.</p></div>';
    }
    h += '<div class="le-actions"><button type="button" class="le-small le-danger" data-group="remove">Remove ' + group.length + ' blocks</button></div>';
    box.innerHTML = h;
    box.querySelectorAll('[data-group]').forEach(function (bt) {
        bt.addEventListener('click', function () {
            var n = this.getAttribute('data-n');
            leGroupAction(this.getAttribute('data-group'), /^\d+$/.test(n || '') ? parseInt(n, 10) : n);
        });
    });
}

/* ---------- carousels ---------- */

function leCarouselHTML(b) {
    var slides = b.slides || [];
    var at = Math.min(b._at || 0, Math.max(0, slides.length - 1));
    if (!slides.length) {
        return '<div class="le-car-empty">Carousel: add photos in the panel on the right →</div>';
    }
    var s = slides[at];
    return '<div class="le-car lay-crop-' + (b.crop || 'landscape') + (b.fit === 'contain' ? ' lay-fit-contain' : '') + '">' +
               '<figure class="lay-figure"><img src="' + leImgSrc(s) + '" alt="" draggable="false"></figure>' +
               (slides.length > 1
                   ? '<button type="button" class="le-car-nav le-car-prev" data-car="' + b._id + '" data-step="-1">‹</button>' +
                     '<button type="button" class="le-car-nav le-car-next" data-car="' + b._id + '" data-step="1">›</button>'
                   : '') +
               '<span class="le-car-badge">Carousel · ' + (at + 1) + ' of ' + slides.length + '</span>' +
           '</div>' +
           (s.caption ? '<div class="le-car-cap">' + escapeHtml(s.caption) + '</div>' : '');
}

function leCarouselStep(id, step) {
    var b = editForm.blocks[leIndex(id)];
    if (!b || !(b.slides || []).length) return;
    b._at = ((b._at || 0) + step + b.slides.length) % b.slides.length;
    renderBlocks();
}

function renderCarouselInspector(b) {
    var slides = b.slides || [];
    var h = '<div class="le-field"><label>Show as</label>' +
        leSeg('type', [['carousel', 'Carousel'], ['gallery', 'Gallery']], b.type, 'prop') + '</div>';
    if (b.type === 'gallery') {
        h += '<div class="le-field"><label>Columns</label>' + leSeg('cols', [[2, '2'], [3, '3'], [4, '4']], b.cols || 3, 'prop') +
             '<p class="help">Photos keep their own shapes and stack like the Portfolio page. Phones show 2 columns.</p></div>';
    } else {
        h += '<div class="le-field"><label>Shape</label>' +
            leSeg('crop', [['landscape', '3:2'], ['wide', '16:9'], ['panorama', 'Panorama'], ['square', 'Square'], ['portrait', '4:5']], b.crop || 'landscape', 'prop') + '</div>';
        h += '<label class="le-check"><input type="checkbox" id="leCarFit"' + (b.fit === 'contain' ? ' checked' : '') + '> Show whole photos (no cropping)</label>';
        h += '<label class="le-check"><input type="checkbox" id="leCarAuto"' + (b.autoplay ? ' checked' : '') + '> Play automatically</label>';
    }
    h += '<div class="le-field"><label>Photos (' + slides.length + ')</label><div class="le-slides">' +
        slides.map(function (s, k) {
            return '<div class="le-slide' + (k === (b._at || 0) ? ' le-slide-on' : '') + '">' +
                '<img src="' + leImgSrc(s) + '" alt="" data-slide-show="' + k + '">' +
                '<input type="text" data-slide-cap="' + k + '" value="' + escapeHtml(s.caption || '') + '" placeholder="Caption">' +
                '<span class="le-slide-btns">' +
                    '<button type="button" data-slide-move="' + k + '" data-step="-1" title="Earlier"' + (k === 0 ? ' disabled' : '') + '>◀</button>' +
                    '<button type="button" data-slide-move="' + k + '" data-step="1" title="Later"' + (k === slides.length - 1 ? ' disabled' : '') + '>▶</button>' +
                    '<button type="button" data-slide-del="' + k + '" title="Remove">✕</button>' +
                '</span></div>';
        }).join('') + '</div>' +
        '<div class="le-btnrow">' +
            '<button type="button" class="secondary le-small" id="leCarLib">Add from library</button>' +
            '<label class="btn-like le-small">Upload<input type="file" id="leCarUpload" accept="image/jpeg,image/png" multiple hidden></label>' +
        '</div></div>';
    if (slides.length) h += '<div class="le-field"><button type="button" class="secondary le-small" id="leCarSplit">Split into separate photos</button></div>';
    return h;
}

function wireCarouselInspector(box, b) {
    var edit = function (fn) { leSnapshot(); fn(); renderBlocks(); };
    if ($('leCarFit')) $('leCarFit').addEventListener('change', function () { var on = this.checked; edit(function () { if (on) b.fit = 'contain'; else delete b.fit; }); });
    if ($('leCarAuto')) $('leCarAuto').addEventListener('change', function () { var on = this.checked; edit(function () { if (on) b.autoplay = true; else delete b.autoplay; }); });
    box.querySelectorAll('[data-slide-show]').forEach(function (img) {
        img.addEventListener('click', function () { b._at = +this.getAttribute('data-slide-show'); renderBlocks(); });
    });
    box.querySelectorAll('[data-slide-cap]').forEach(function (inp) {
        inp.addEventListener('input', function () {
            var k = +this.getAttribute('data-slide-cap');
            if (editForm.typing !== b._id + 's' + k) { leSnapshot(); editForm.typing = b._id + 's' + k; leUndoButtons(); }
            b.slides[k].caption = this.value;
        });
        inp.addEventListener('change', function () { renderBlocks(); });
    });
    box.querySelectorAll('[data-slide-move]').forEach(function (bt) {
        bt.addEventListener('click', function () {
            var k = +this.getAttribute('data-slide-move'), j = k + (+this.getAttribute('data-step'));
            edit(function () { var t = b.slides[k]; b.slides[k] = b.slides[j]; b.slides[j] = t; b._at = j; });
        });
    });
    box.querySelectorAll('[data-slide-del]').forEach(function (bt) {
        bt.addEventListener('click', function () {
            var k = +this.getAttribute('data-slide-del');
            edit(function () { b.slides.splice(k, 1); b._at = Math.max(0, Math.min(b._at || 0, b.slides.length - 1)); });
        });
    });
    $('leCarLib').addEventListener('click', function () {
        openLibraryPicker(function (fn) {
            leSnapshot();
            b.slides.push({ src: fn.indexOf('/') === -1 ? 'images/Thumb/' + fn : fn, caption: '' });
            b._at = b.slides.length - 1;
            renderBlocks();
        }, null, true);
    });
    $('leCarUpload').addEventListener('change', function (e) {
        var files = Array.prototype.slice.call(e.target.files);
        e.target.value = '';
        if (!files.length) return;
        edit(function () {
            files.forEach(function (f) { b.slides.push({ file: f, previewUrl: URL.createObjectURL(f), caption: '' }); });
            b._at = b.slides.length - files.length;
        });
    });
    if ($('leCarSplit')) $('leCarSplit').addEventListener('click', function () {
        leSnapshot();
        var at = editForm.blocks.indexOf(b), nx = editForm.blocks[at + 1];
        var per = Math.max(1, Math.min(4, b.slides.length));
        var photos = b.slides.map(function (s, k) {
            var p = { _id: leId(), type: 'image', crop: b.crop || 'landscape', caption: s.caption || '', w: Math.round(12 / per), newRow: k === 0 };
            if (s.file) { p.file = s.file; p.previewUrl = s.previewUrl; } else p.src = s.src;
            return p;
        });
        leFillCustomWidths(photos);
        if (nx && !nx.newRow) nx.newRow = true;
        Array.prototype.splice.apply(editForm.blocks, [at, 1].concat(photos));
        editForm.sel = photos[0]._id;
        renderBlocks();
    });
}

/* ---------- more block types ----------
   gallery  { slides: [{ src, caption }], cols }      masonry columns of photos
   compare  { before: { src }, after: { src }, crop, beforeLabel, afterLabel }
   banner   { src, title, text, place, shade, crop }   a photo with words over it
   button   { label, href, look: solid|outline, align }
   Photos on these can be library photos or new uploads, just like photo blocks. */

/* Camera line for a library photo, e.g. "OM System OM-5 · 300mm · f/5.6 · 1/1000s · ISO 200". */
function leExifLine(src) {
    var fn = (src || '').split('/').pop();
    var p = state.byFilename[fn];
    if (!p) return '';
    var shutter = p.shutter ? (String(p.shutter).slice(-1) === 's' ? p.shutter : p.shutter + 's') : '';
    return [p.camera, p.focal, p.aperture, shutter, p.iso ? 'ISO ' + p.iso : ''].filter(Boolean).join(' · ');
}

function leGalleryHTML(b) {
    var slides = b.slides || [];
    if (!slides.length) return '<div class="le-car-empty">Gallery: add photos in the panel on the right →</div>';
    return '<div class="le-gal" style="--cols:' + (b.cols || 3) + '">' + slides.map(function (s) {
        return '<figure class="lay-figure"><img src="' + leImgSrc(s) + '" alt="" draggable="false"></figure>';
    }).join('') + '</div>';
}

function leSlotImg(slot, label) {
    return slot && (slot.src || slot.file)
        ? '<img src="' + leImgSrc(slot) + '" alt="" draggable="false">'
        : '<div class="le-slot-empty">' + label + '</div>';
}

function leCompareHTML(b) {
    var crop = b.crop || 'landscape';
    return '<div class="le-cmp lay-crop-' + crop + '">' +
               '<div class="le-cmp-half le-cmp-before">' + leSlotImg(b.before, 'Before photo') + '<span>' + escapeHtml(b.beforeLabel || 'Before') + '</span></div>' +
               '<div class="le-cmp-half le-cmp-after">' + leSlotImg(b.after, 'After photo') + '<span>' + escapeHtml(b.afterLabel || 'After') + '</span></div>' +
               '<div class="le-cmp-line"></div>' +
           '</div>';
}

function leBannerHTML(b) {
    return '<div class="le-bnr lay-crop-' + (b.crop || 'wide') + ' lay-bn-' + (b.place || 'center') + '" style="--shade:' + (b.shade == null ? 0.35 : b.shade) + '">' +
               leSlotImg(b, 'Choose a photo in the panel →') +
               '<div class="lay-bn-text">' +
                   '<div class="lay-bn-title">' + escapeHtml(b.title || 'Banner title') + '</div>' +
                   (b.text ? '<div class="lay-bn-sub">' + escapeHtml(b.text) + '</div>' : '') +
               '</div>' +
           '</div>';
}

function leButtonHTML(b) {
    return '<div class="le-btnwrap lay-ta-' + (b.align || 'center') + '"><span class="le-btnprev le-btn-' + (b.look || 'solid') + '">' +
           escapeHtml(b.label || 'Button') + '</span></div>';
}

/* A small photo picker row used by the compare and banner panels. */
function lePhotoSlotField(label, key) {
    return '<div class="le-field"><label>' + label + '</label><div class="le-btnrow">' +
        '<button type="button" class="secondary le-small" data-slot-lib="' + key + '">From library</button>' +
        '<label class="btn-like le-small">Upload<input type="file" data-slot-up="' + key + '" accept="image/jpeg,image/png" hidden></label>' +
        '</div></div>';
}

/* key '' means the block itself holds the photo (banner); otherwise b[key]. */
function wirePhotoSlots(box, b) {
    function target(key) {
        if (!key) return b;
        if (!b[key]) b[key] = {};
        return b[key];
    }
    box.querySelectorAll('[data-slot-lib]').forEach(function (bt) {
        bt.addEventListener('click', function () {
            var key = this.getAttribute('data-slot-lib');
            openLibraryPicker(function (fn) {
                leSnapshot();
                var t = target(key);
                delete t.file; delete t.previewUrl;
                t.src = fn.indexOf('/') === -1 ? 'images/Thumb/' + fn : fn;
                renderBlocks();
            });
        });
    });
    box.querySelectorAll('[data-slot-up]').forEach(function (inp) {
        inp.addEventListener('change', function (e) {
            var f = e.target.files[0];
            e.target.value = '';
            if (!f) return;
            leSnapshot();
            var t = target(this.getAttribute('data-slot-up'));
            delete t.src;
            t.file = f; t.previewUrl = URL.createObjectURL(f);
            renderBlocks();
        });
    });
}

/* Live text fields in the panel (title, label, link…): one undo step per burst. */
function wireTextProps(box, b) {
    box.querySelectorAll('[data-tprop]').forEach(function (inp) {
        var prop = inp.getAttribute('data-tprop');
        inp.addEventListener('input', function () {
            if (editForm.typing !== b._id + prop) { leSnapshot(); editForm.typing = b._id + prop; leUndoButtons(); }
            b[prop] = inp.value;
            var cell = document.querySelector('#leCanvas .le-cell[data-id="' + b._id + '"]');
            if (cell) {
                var tools = cell.querySelector('.le-tools').outerHTML, resize = '<div class="le-resize" title="Drag to change the width"></div>';
                cell.innerHTML = tools + leBlockInner(b) + resize;
                cell.querySelector('.le-resize').addEventListener('pointerdown', leResizeStart);
            }
        });
    });
}

function leTextField(label, prop, value, placeholder) {
    return '<div class="le-field"><label>' + label + '</label><input type="text" data-tprop="' + prop + '" value="' +
           escapeHtml(value || '') + '" placeholder="' + escapeHtml(placeholder || '') + '"></div>';
}

function renderExtraInspector(b) {
    var h = '';
    if (b.type === 'compare') {
        h += lePhotoSlotField('Before photo', 'before') + lePhotoSlotField('After photo', 'after');
        h += '<div class="le-field"><label>Shape</label>' +
             leSeg('crop', [['landscape', '3:2'], ['wide', '16:9'], ['square', 'Square'], ['portrait', '4:5'], ['panorama', 'Panorama']], b.crop || 'landscape', 'prop') + '</div>';
        h += leTextField('Left label', 'beforeLabel', b.beforeLabel, 'Before') + leTextField('Right label', 'afterLabel', b.afterLabel, 'After');
        h += '<p class="help">Visitors drag the line across to compare. Great for edits, seasons or then-and-now.</p>';
    } else if (b.type === 'banner') {
        h += lePhotoSlotField('Photo', '');
        h += leTextField('Title', 'title', b.title, 'Banner title') + leTextField('Smaller line', 'text', b.text, 'Optional');
        h += '<div class="le-field"><label>Words sit</label>' +
             leSeg('place', [['center', 'Middle'], ['bottom-left', 'Bottom left'], ['bottom', 'Bottom'], ['top-left', 'Top left']], b.place || 'center', 'prop') + '</div>';
        h += '<div class="le-field"><label>Shape</label>' +
             leSeg('crop', [['panorama', 'Panorama'], ['wide', '16:9'], ['landscape', '3:2'], ['square', 'Square']], b.crop || 'wide', 'prop') + '</div>';
        h += '<div class="le-field"><label>Darken the photo</label>' +
             leSeg('shade', [['0', 'None'], ['0.2', 'Light'], ['0.35', 'Medium'], ['0.55', 'Strong']], String(b.shade == null ? 0.35 : b.shade), 'prop') + '</div>';
    } else if (b.type === 'button') {
        h += leTextField('Button text', 'label', b.label, 'e.g. Buy a print') + leTextField('Links to', 'href', b.href, 'https://… or /contact.html');
        h += '<div class="le-field"><label>Look</label>' + leSeg('look', [['solid', 'Solid'], ['outline', 'Outline']], b.look || 'solid', 'prop') + '</div>';
        h += '<div class="le-field"><label>Position</label>' + leSeg('align', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], b.align || 'center', 'prop') + '</div>';
    }
    return h;
}

/* ---------- safety backup of unsaved edits ----------
   While a post or project is open, its blocks and page settings are copied to
   this browser every few seconds. If the tab closes or crashes before saving,
   opening the same post/project again offers to bring the changes back.
   Photos uploaded but not yet saved can't be kept this way (the browser
   only holds them in memory), so those come back as empty photo slots. */

var LE_BACKUP_KEY = 'sp_layout_backup';
var leBackupTimer = null;

function leBackupId() {
    return editForm.kind + ':' + (editForm.index === null ? 'new' : editForm.index);
}

function leScheduleBackup() {
    if (!editForm || !editForm.undo.length) return;
    clearTimeout(leBackupTimer);
    leBackupTimer = setTimeout(leWriteBackup, 1500);
}

function leWriteBackup() {
    if (!editForm) return;
    var strip = function (o) {
        var c = {};
        Object.keys(o).forEach(function (k) {
            if (k === 'file' || k === 'previewUrl' || k === '_finalSrc' || k === '_at') return;
            var v = o[k];
            if (v && typeof v === 'object' && !Array.isArray(v)) v = strip(v);
            else if (Array.isArray(v)) v = v.map(function (x) { return x && typeof x === 'object' ? strip(x) : x; });
            c[k] = v;
        });
        return c;
    };
    var titleEl = $('pfTitle') || $('prTitle');
    try {
        localStorage.setItem(LE_BACKUP_KEY, JSON.stringify({
            id: leBackupId(), title: titleEl ? titleEl.value : '', at: Date.now(),
            layout: editForm.layout, blocks: editForm.blocks.map(strip)
        }));
    } catch (e) { /* storage full or blocked: nothing to do */ }
}

function leClearBackup() {
    clearTimeout(leBackupTimer);
    try { localStorage.removeItem(LE_BACKUP_KEY); } catch (e) {}
}

/* Offer to restore a backup for the post/project that has just been opened. */
function leOfferBackup() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(LE_BACKUP_KEY) || 'null'); } catch (e) {}
    if (!raw || raw.id !== leBackupId() || !raw.blocks) return;
    var when = new Date(raw.at);
    var note = document.createElement('div');
    note.className = 'le-restore';
    note.innerHTML = '<span>You have unsaved changes to <b>' + escapeHtml(raw.title || 'this page') + '</b> from ' +
        when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' +
        when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) + '. Bring them back?</span>' +
        '<button type="button" class="le-small" id="leRestoreYes">Restore</button>' +
        '<button type="button" class="secondary le-small" id="leRestoreNo">Discard</button>';
    var ed = $('layoutEditor');
    ed.parentNode.insertBefore(note, ed);
    $('leRestoreYes').addEventListener('click', function () {
        leSnapshot();
        editForm.layout = editLayoutFor({ layout: raw.layout });
        editForm.blocks = raw.blocks.map(function (b) { b._id = leId(); return b; });
        if (raw.title && (($('pfTitle') || $('prTitle')) || {}).value === '') (($('pfTitle') || $('prTitle'))).value = raw.title;
        note.remove();
        renderBlocks();
    });
    $('leRestoreNo').addEventListener('click', function () { leClearBackup(); note.remove(); });
}

/* ---------- templates ----------
   A starting layout for an empty page. Photo slots start empty: click one,
   then "Choose photo" or "Upload" in the panel. Text starts with a hint. */

var LE_TEMPLATES = {
    essay: {
        name: 'Photo essay', desc: 'Big banner, an introduction, then photos and words taking turns.',
        layout: { width: 'wide', gap: 'normal' },
        blocks: [
            { type: 'banner', w: 12, crop: 'panorama', place: 'bottom-left', shade: 0.35, title: 'Your title', text: 'A short line about the place' },
            { type: 'text', w: 8, style: 'body', dropcap: true, text: 'Start with what drew you there, and what you hoped to find.' },
            { type: 'image', w: 7, crop: 'original' },
            { type: 'text', w: 5, valign: 'center', join: true, text: 'A few words about this photo: the moment, the light, the wait.' },
            { type: 'text', w: 5, valign: 'center', text: 'And the next one.' },
            { type: 'image', w: 7, crop: 'original', join: true },
            { type: 'text', w: 8, style: 'quote', align: 'center', text: 'A line worth pulling out.' },
            { type: 'gallery', w: 12, cols: 3, slides: [] }
        ]
    },
    diary: {
        name: 'Trip diary', desc: 'Day-by-day headings with text and a pair of photos for each day.',
        layout: { width: 'standard', gap: 'normal' },
        blocks: [
            { type: 'text', w: 12, text: 'Where you went and why, in a sentence or two.' },
            { type: 'text', w: 12, style: 'subheading', text: 'Day one' },
            { type: 'text', w: 12, text: 'What happened on day one.' },
            { type: 'image', w: 6, crop: 'landscape' }, { type: 'image', w: 6, crop: 'landscape', join: true },
            { type: 'text', w: 12, style: 'subheading', text: 'Day two' },
            { type: 'text', w: 12, text: 'What happened on day two.' },
            { type: 'image', w: 6, crop: 'landscape' }, { type: 'image', w: 6, crop: 'landscape', join: true },
            { type: 'divider', w: 12 },
            { type: 'button', w: 12, label: 'Get in touch', href: '/contact.html', look: 'outline', align: 'center' }
        ]
    },
    showcase: {
        name: 'Photo showcase', desc: 'Lead photo, a short intro, a 3-across grid and a carousel. Mostly pictures.',
        layout: { width: 'full', gap: 'tight' },
        blocks: [
            { type: 'image', w: 12, crop: 'wide' },
            { type: 'text', w: 8, align: 'center', text: 'A short introduction to the set.' },
            { type: 'image', w: 4, crop: 'square' }, { type: 'image', w: 4, crop: 'square', join: true }, { type: 'image', w: 4, crop: 'square', join: true },
            { type: 'carousel', w: 12, crop: 'wide', slides: [] }
        ]
    },
    review: {
        name: 'Edit / gear story', desc: 'Before/after slider, camera settings and notes. Good for "how I made this".',
        layout: { width: 'standard', gap: 'normal' },
        blocks: [
            { type: 'text', w: 12, style: 'heading', text: 'How I made this photo' },
            { type: 'image', w: 12, crop: 'original', exif: true },
            { type: 'text', w: 12, style: 'subheading', text: 'The edit' },
            { type: 'compare', w: 12, crop: 'landscape', beforeLabel: 'Raw', afterLabel: 'Edited', before: {}, after: {} },
            { type: 'text', w: 12, text: 'What you changed and why.' }
        ]
    }
};

function leTemplatePicker() {
    return '<div class="le-templates"><div class="le-tpl-head">Or start from a layout</div>' +
        Object.keys(LE_TEMPLATES).map(function (k) {
            var t = LE_TEMPLATES[k];
            return '<button type="button" class="le-tpl" data-tpl="' + k + '"><b>' + t.name + '</b><span>' + t.desc + '</span></button>';
        }).join('') + '</div>';
}

function leApplyTemplate(key) {
    var t = LE_TEMPLATES[key];
    if (!t) return;
    leSnapshot();
    Object.keys(t.layout).forEach(function (k) { editForm.layout[k] = t.layout[k]; });
    editForm.blocks = JSON.parse(JSON.stringify(t.blocks)).map(function (b, i) {
        b._id = leId();
        b.newRow = i === 0 || !b.join;
        delete b.join;
        if (b.type === 'text') { b.style = b.style || 'body'; b.align = b.align || 'left'; }
        if (b.type === 'image') b.caption = '';
        return b;
    });
    leFillCustomWidths(editForm.blocks);
    editForm.sel = null;
    renderBlocks();
}

/* ---------- copy, paste and keyboard shortcuts ---------- */

var LE_CLIP_KEY = 'sp_layout_clipboard';

function leCopy() {
    var group = (editForm.multi || []).length ? leMultiBlocks() : (leSelected() ? [leSelected()] : []);
    if (!group.length) return;
    var data = group.map(function (b) { var c = JSON.parse(JSON.stringify(b, function (k, v) { return (k === 'file' || k === 'previewUrl') ? undefined : v; })); return c; });
    try { localStorage.setItem(LE_CLIP_KEY, JSON.stringify(data)); } catch (e) {}
    leToast(group.length === 1 ? 'Copied. Ctrl+V pastes it, even into another post or project.' : 'Copied ' + group.length + ' blocks.');
}

function lePaste() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(LE_CLIP_KEY) || 'null'); } catch (e) {}
    if (!data || !data.length) return;
    var blocks = data.map(function (b, k) { b._id = leId(); b.newRow = k === 0 ? true : !!b.newRow; return b; });
    leInsert(blocks);
}

function leToast(msg) {
    var t = $('leToast');
    if (!t) { t = document.createElement('div'); t.id = 'leToast'; t.className = 'le-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.remove('on'); }, 2200);
}

function leKeys(e) {
    var mod = e.ctrlKey || e.metaKey, key = (e.key || '').toLowerCase();
    var b = leSelected(), many = (editForm.multi || []).length > 1;
    if ((key === 'delete' || key === 'backspace') && (b || many)) {
        e.preventDefault();
        if (many) leGroupAction('remove'); else leRemove(b);
    } else if (mod && key === 'd' && b) {
        e.preventDefault(); $('leDup') && $('leDup').click();
    } else if (mod && key === 'c' && (b || many)) {
        e.preventDefault(); leCopy();
    } else if (mod && key === 'v') {
        e.preventDefault(); lePaste();
    } else if (e.altKey && (key === 'arrowup' || key === 'arrowleft') && b) {
        e.preventDefault(); leMove(b, -1);
    } else if (e.altKey && (key === 'arrowdown' || key === 'arrowright') && b) {
        e.preventDefault(); leMove(b, 1);
    } else if (key === 'escape' && b) {
        leSelect(null);
    } else {
        return false;
    }
    return true;
}

/* ---------- dragging blocks ----------
   Nothing on the page moves while a block is being dragged: the block stays
   where it is (dimmed), a small copy follows the pointer, and a bright line
   shows exactly where it will land:
     - a vertical line beside a block: it joins that row, before/after it
     - a horizontal line between rows: it gets a row of its own there
   Where it lands is worked out from the block list itself, never read back
   off the screen, so a block can't be lost or duplicated. */

var leDrag = null;

function leDragDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    var cell = e.currentTarget;
    var id = cell.getAttribute('data-id');
    // Text works like most design tools: the first click on a text block
    // selects it (and can drag it); once selected, clicking in it edits.
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        leToggleMulti(id);
        return;
    }
    var ta = e.target.closest('textarea');
    if (ta && cell.classList.contains('le-sel') && !(editForm.multi || []).length) return;
    if (!ta && e.target.closest('input, select, button, .le-resize')) return;
    leSelect(id);
    leDrag = { id: id, cell: cell, x0: e.clientX, y0: e.clientY, started: false, pointerId: e.pointerId, ta: ta };
    document.addEventListener('pointermove', leDragMove);
    document.addEventListener('pointerup', leDragUp);
    document.addEventListener('pointercancel', leDragCancel);
    document.addEventListener('keydown', leDragKey);
    // Stop the browser selecting text or starting its own image drag.
    e.preventDefault();
}

/* Positions of every block and row, measured once when the drag starts
   (in page coordinates, so scrolling during the drag doesn't upset them). */
function leMeasure() {
    var sx = window.scrollX, sy = window.scrollY;
    var rows = leRows().map(function (row) {
        var cells = row.map(function (b) {
            var el = document.querySelector('#leCanvas .le-cell[data-id="' + b._id + '"]');
            var r = el.getBoundingClientRect();
            return { id: b._id, left: r.left + sx, right: r.right + sx, top: r.top + sy, bottom: r.bottom + sy };
        });
        return {
            cells: cells,
            top: Math.min.apply(Math, cells.map(function (c) { return c.top; })),
            bottom: Math.max.apply(Math, cells.map(function (c) { return c.bottom; }))
        };
    });
    var cr = $('leCanvas').getBoundingClientRect();
    return { rows: rows, left: cr.left + sx, right: cr.right + sx };
}

function leDragMove(e) {
    var d = leDrag;
    if (!d) return;
    d.px = e.pageX; d.py = e.pageY; d.cx = e.clientX; d.cy = e.clientY;
    if (!d.started) {
        if (Math.abs(e.clientX - d.x0) + Math.abs(e.clientY - d.y0) < 6) return;
        leDragBegin(e);
    }
    d.ghost.style.transform = 'translate(' + (e.clientX + 14) + 'px,' + (e.clientY + 14) + 'px)';
    leDragTarget();
    leAutoScroll();
}

function leDragBegin(e) {
    var d = leDrag;
    d.started = true;
    var sel = window.getSelection && window.getSelection();
    if (sel && sel.removeAllRanges) sel.removeAllRanges();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    d.geo = leMeasure();
    d.cell.classList.add('le-dragsrc');
    document.body.classList.add('le-grabbing');

    var b = editForm.blocks[leIndex(d.id)];
    var ghost = document.createElement('div');
    ghost.className = 'le-drag-ghost';
    if (b.type === 'image') ghost.innerHTML = '<img src="' + leImgSrc(b) + '" alt="">';
    else if (b.type === 'text') ghost.textContent = (b.text || 'Text').slice(0, 60);
    else ghost.textContent = b.type === 'spacer' ? 'Space' : 'Line';
    document.body.appendChild(ghost);
    d.ghost = ghost;

    var line = document.createElement('div');
    line.className = 'le-drop-line';
    document.body.appendChild(line);
    d.line = line;
}

/* Work out the drop target under the pointer and draw the line for it. */
function leDragTarget() {
    var d = leDrag, g = d.geo, x = d.px, y = d.py;
    var rows = g.rows, t = null;
    var EDGE = 16;   // px from a row's top/bottom edge that means "a new row here"

    if (!rows.length) t = { row: 0 };
    else if (y < rows[0].top + EDGE) t = { row: 0 };
    else if (y > rows[rows.length - 1].bottom - EDGE) t = { row: rows.length };
    else {
        for (var r = 0; r < rows.length; r++) {
            var R = rows[r];
            if (y < R.top) { t = { row: r }; break; }                 // in the gap above row r
            if (y <= R.bottom) {
                var edge = Math.min(EDGE, (R.bottom - R.top) / 4);
                if (y < R.top + edge) { t = { row: r }; break; }
                if (y > R.bottom - edge) { t = { row: r + 1 }; break; }
                // Inside the row: the nearest block on the same line.
                var line = R.cells.filter(function (c) { return y >= c.top && y <= c.bottom; });
                if (!line.length) line = R.cells;
                var best = null, bestD = Infinity;
                line.forEach(function (c) {
                    var dx = x < c.left ? c.left - x : (x > c.right ? x - c.right : 0);
                    var dy = y < c.top ? c.top - y : (y > c.bottom ? y - c.bottom : 0);
                    var dist = dx + dy * 2;
                    if (dist < bestD) { bestD = dist; best = c; }
                });
                t = { cell: best.id, after: x > (best.left + best.right) / 2, box: best };
                break;
            }
        }
        if (!t) t = { row: rows.length };
    }
    d.target = t;

    // Draw the line (page coordinates -> fixed position on screen).
    var sx = window.scrollX, sy = window.scrollY, s = d.line.style;
    if (t.cell) {
        var c = t.box, gap = 8;
        var lx = t.after ? c.right + gap / 2 : c.left - gap / 2;
        d.line.className = 'le-drop-line le-drop-v';
        s.left = (lx - 2 - sx) + 'px'; s.top = (c.top - sy) + 'px';
        s.width = '4px'; s.height = (c.bottom - c.top) + 'px';
    } else {
        var ly;
        if (!rows.length) ly = y;
        else if (t.row === 0) ly = rows[0].top - 6;
        else if (t.row >= rows.length) ly = rows[rows.length - 1].bottom + 6;
        else ly = (rows[t.row - 1].bottom + rows[t.row].top) / 2;
        d.line.className = 'le-drop-line le-drop-h';
        s.left = (g.left - sx) + 'px'; s.top = (ly - 2 - sy) + 'px';
        s.width = (g.right - g.left) + 'px'; s.height = '4px';
    }
}

/* Scroll the page when dragging near the top or bottom of the window. */
function leAutoScroll() {
    var d = leDrag;
    if (!d || d.scrolling) return;
    var step = function () {
        if (!leDrag || !leDrag.started) { if (d) d.scrolling = false; return; }
        var y = leDrag.cy, h = window.innerHeight, v = 0;
        if (y < 70) v = -Math.ceil((70 - y) / 5);
        else if (y > h - 70) v = Math.ceil((y - (h - 70)) / 5);
        if (!v) { leDrag.scrolling = false; return; }
        window.scrollBy(0, v);
        leDrag.py += v;
        leDragTarget();
        requestAnimationFrame(step);
    };
    d.scrolling = true;
    requestAnimationFrame(step);
}

function leDragKey(e) { if (e.key === 'Escape') leDragCancel(); }

function leDragEnd() {
    document.removeEventListener('pointermove', leDragMove);
    document.removeEventListener('pointerup', leDragUp);
    document.removeEventListener('pointercancel', leDragCancel);
    document.removeEventListener('keydown', leDragKey);
    document.body.classList.remove('le-grabbing');
    var d = leDrag;
    leDrag = null;
    if (d && d.started) {
        d.cell.classList.remove('le-dragsrc');
        if (d.ghost) d.ghost.remove();
        if (d.line) d.line.remove();
    }
    return d;
}

function leDragCancel() { leDragEnd(); }

function leDragUp() {
    var d = leDragEnd();
    if (d && !d.started && d.ta) {   // a click on a text block: start editing it
        var ta = document.querySelector('textarea.le-text[data-id="' + d.id + '"]');
        if (ta) ta.focus();
        return;
    }
    if (!d || !d.started || !d.target) return;
    leApplyMove(d.id, d.target);
}

/* Move block `id` to the target. Works purely on editForm.blocks. */
function leApplyMove(id, t) {
    var before = editForm.blocks.map(function (b) { return b._id + (b.newRow ? '|' : ''); }).join(',');
    var list = editForm.blocks.slice();
    var i = -1;
    for (var k = 0; k < list.length; k++) if (list[k]._id === id) i = k;
    if (i === -1) return;
    var state = leState();
    var moved = list[i];
    var wasRowStart = i === 0 || moved.newRow;
    var next = list[i + 1];
    list.splice(i, 1);
    // If it started its row, the block after it now starts that row.
    if (wasRowStart && next && !next.newRow) next.newRow = true;
    if (list.length) list[0].newRow = true;

    var joined = null;
    if (t.cell) {
        if (t.cell === id) return leRestoreSilently(state);
        var j = -1;
        for (var m = 0; m < list.length; m++) if (list[m]._id === t.cell) j = m;
        if (j === -1) return leRestoreSilently(state);
        var target = list[j];
        if (t.after) {
            moved.newRow = false;
            list.splice(j + 1, 0, moved);
        } else {
            moved.newRow = !!target.newRow || j === 0;
            target.newRow = false;
            list.splice(j, 0, moved);
        }
        joined = target;
    } else {
        // Index of the first block of row t.row in the shortened list.
        var r = -1, at = list.length;
        for (var n = 0; n < list.length; n++) {
            if (n === 0 || list[n].newRow) { r++; if (r === t.row) { at = n; break; } }
        }
        moved.newRow = true;
        if (at < list.length) list[at].newRow = true;
        list.splice(at, 0, moved);
    }

    var after = list.map(function (b) { return b._id + (b.newRow ? '|' : ''); }).join(',');
    if (after === before) return leRestoreSilently(state);   // dropped where it already was

    // Never lose or duplicate a block.
    if (list.length !== editForm.blocks.length) return leRestoreSilently(state);

    editForm.undo.push(state);
    if (editForm.undo.length > 60) editForm.undo.shift();
    editForm.redo = [];
    editForm.typing = null;
    editForm.blocks = list;

    // Dropped beside something in a row that is now too full: share the line equally.
    var prop = leWProp();
    if (joined && prop) {
        var row = leRows().filter(function (rw) { return rw.indexOf(moved) !== -1; })[0];
        var total = row.reduce(function (s, b) { return s + leEffW(b); }, 0);
        if (total > 12 && total - leEffW(moved) <= 12 && row.length <= 6) leEqualise(row, prop);
    }
    editForm.sel = moved._id;
    renderBlocks();
}

/* Undo any newRow flags touched while working out a move that didn't happen. */
function leRestoreSilently(state) {
    editForm.blocks.forEach(function (b, k) { b.newRow = state.blocks[k].newRow; });
}

/* Drag a block's right edge: snaps to twelfths of the row. */
function leResizeStart(e) {
    e.preventDefault();
    e.stopPropagation();
    var handle = e.currentTarget;
    var cell = handle.parentNode;
    var id = cell.getAttribute('data-id');
    var b = editForm.blocks[leIndex(id)];
    var prop = leWProp();
    leSelect(id);
    if (!prop) return;
    var row = cell.parentNode;
    var gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    var colW = (row.clientWidth + gap) / 12;
    var left = cell.getBoundingClientRect().left;
    var startW = leEffW(b), w = startW;
    var label = cell.querySelector('.le-wl');
    cell.classList.add('le-resizing');
    handle.setPointerCapture(e.pointerId);

    function move(ev) {
        var nw = Math.max(1, Math.min(12, Math.round((ev.clientX - left + gap) / colW)));
        if (nw === w) return;
        w = nw;
        cell.style.setProperty('--w', w);
        label.textContent = leWidthLabel(w);
    }
    function up() {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        cell.classList.remove('le-resizing');
        if (w !== startW) { leSnapshot(); b[prop] = w; }
        renderBlocks();
    }
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
}

/* ---------- the settings panel ---------- */

function renderInspector() {
    var box = $('leInspector');
    if (!box) return;
    leUndoButtons();
    if ((editForm.multi || []).length > 1) { renderMultiInspector(box); return; }
    var b = leSelected();
    if (!b) {
        box.innerHTML =
            '<div class="le-ins-title">How it works</div>' +
            '<ul class="le-tips">' +
                '<li><b>Click</b> a block to change its settings here.</li>' +
                '<li><b>Drag</b> any block to move it (click text once more to type in it). A <b>bright line</b> shows where it will land: ' +
                    'an upright line puts it <b>beside</b> that block, a flat line gives it a <b>row of its own</b>. Esc cancels.</li>' +
                '<li><b>Shift- or Ctrl-click</b> several blocks to arrange them together, give them one size, or turn photos into a <b>carousel, gallery or before/after</b>.</li>' +
                '<li><b>More blocks…</b> in the Add bar has banners, galleries, carousels, before/after sliders and buttons.</li>' +
                '<li><b>Drag the right edge</b> of a block to make it wider or narrower.</li>' +
                '<li>Blocks wrap onto the next line when a row is full, so three photos at ⅓ make a grid.</li>' +
                '<li>In text, <code>**bold**</code>, <code>*italic*</code> and <code>[link](https://…)</code> work.</li>' +
                '<li><b>Shortcuts:</b> Ctrl+Z undo · Delete removes · Ctrl+D duplicates · Ctrl+C / Ctrl+V copy and paste (even between posts) · Alt+arrows move · Esc deselects.</li>' +
                '<li>Unsaved changes are backed up in this browser, so a closed tab can be recovered.</li>' +
            '</ul>';
        return;
    }
    var i = leIndex(b._id);
    var rows = leRows();
    var myRow = rows.filter(function (r) { return r.indexOf(b) !== -1; })[0] || [b];
    var w = leEffW(b);
    var wProp = leWProp();
    var typeName = { text: 'Text', image: 'Photo', spacer: 'Space', divider: 'Line', carousel: 'Carousel', gallery: 'Gallery',
                     compare: 'Before / after', banner: 'Banner', button: 'Button' }[b.type];
    var h = '<div class="le-ins-title">' + typeName + '</div>';

    var sizeWord = editForm.view === 'laptop' ? '' : ' on ' + editForm.view;
    if (wProp) {
        h += '<div class="le-field"><label>Width' + sizeWord + ' <span class="le-muted">' + leWidthLabel(w) + (w !== 12 ? ' (' + w + '/12)' : '') + '</span></label>' +
             leSeg('w', [[3, '¼'], [4, '⅓'], [6, '½'], [8, '⅔'], [9, '¾'], [12, 'Full']], w, 'prop') +
             '<input type="range" min="1" max="12" step="1" value="' + w + '" id="leWRange"></div>';
    } else {
        h += '<div class="le-field"><label>Width' + sizeWord + ' <span class="le-muted">' + leWidthLabel(w) + ', automatic</span></label>' +
             '<p class="help">Choose <b>Custom ' + editForm.view + ' layout</b> above the page to set it yourself.</p></div>';
    }
    if (myRow.length > 1 && wProp) {
        h += '<div class="le-field"><button type="button" class="secondary le-small" id="leFitRow">Fit this row on one line' + sizeWord + '</button></div>';
    }
    if (myRow.length > 1) {
        h += '<div class="le-field"><label>Line up with its row</label>' +
             leSeg('valign', [['top', 'Top'], ['center', 'Middle'], ['bottom', 'Bottom']], b.valign || 'top', 'prop') + '</div>';
    }
    h += '<div class="le-field"><label>Show on</label><div class="le-shows">' +
         ['laptop', 'tablet', 'phone'].map(function (v) {
             return '<label class="le-check"><input type="checkbox" data-show="' + LE_HIDE_KEY[v] + '"' +
                    (b[LE_HIDE_KEY[v]] ? '' : ' checked') + '> ' + v.charAt(0).toUpperCase() + v.slice(1) + '</label>';
         }).join('') + '</div></div>';
    h += '<label class="le-check"><input type="checkbox" id="leNewRow"' + (b.newRow || i === 0 ? ' checked' : '') +
         (i === 0 ? ' disabled' : '') + '> Start a new row</label>';

    if (b.type === 'text') {
        h += '<div class="le-field"><label>Style</label>' +
             leSeg('style', [['body', 'Paragraph'], ['heading', 'Heading'], ['subheading', 'Subheading'], ['quote', 'Quote'], ['small', 'Small']], b.style || 'body', 'prop') + '</div>';
        h += '<div class="le-field"><label>Alignment</label>' +
             leSeg('align', [['left', 'Left'], ['center', 'Centre'], ['right', 'Right'], ['justify', 'Justify']], b.align || 'left', 'prop') + '</div>';
        h += '<div class="le-field"><label>Formatting</label><div class="le-seg">' +
             '<button type="button" class="le-seg-btn" data-fmt="bold"><b>B</b></button>' +
             '<button type="button" class="le-seg-btn" data-fmt="italic"><i>I</i></button>' +
             '<button type="button" class="le-seg-btn" data-fmt="link">Link</button></div>' +
             '<p class="help">Select some words in the block, then press a button.</p></div>';
        if ((b.style || 'body') === 'body') {
            h += '<label class="le-check"><input type="checkbox" id="leDropcap"' + (b.dropcap ? ' checked' : '') + '> Large first letter (drop cap)</label>';
        }
    } else if (b.type === 'image') {
        h += '<div class="le-field"><label>Shape</label>' +
             leSeg('crop', [['original', 'Original'], ['square', 'Square'], ['landscape', '3:2'], ['portrait', '4:5'], ['wide', '16:9'], ['panorama', 'Panorama']], b.crop || 'original', 'prop') +
             '<p class="help">Anything but Original crops to that shape from the centre.</p></div>';
        h += '<div class="le-field"><label for="leCaptionIns">Caption</label>' +
             '<input type="text" id="leCaptionIns" value="' + escapeHtml(b.caption || '') + '" placeholder="Optional"></div>';
        h += '<label class="le-check"><input type="checkbox" id="leZoom"' + (b.zoom !== false ? ' checked' : '') + '> Click to view full screen</label>';
        if (leExifLine(b.src)) {
            h += '<label class="le-check"><input type="checkbox" id="leExif"' + (b.exif ? ' checked' : '') + '> Show camera settings under it</label>';
        }
        h += (b.src || b.file)
            ? '<div class="le-field"><button type="button" class="secondary le-small" id="leReplace">Replace photo…</button></div>'
            : lePhotoSlotField('Choose the photo', '');
    } else if (b.type === 'carousel' || b.type === 'gallery') {
        h += renderCarouselInspector(b);
    } else if (b.type === 'compare' || b.type === 'banner' || b.type === 'button') {
        h += renderExtraInspector(b);
    } else if (b.type === 'spacer') {
        h += '<div class="le-field"><label>Height</label>' +
             leSeg('size', [['s', 'Small'], ['m', 'Medium'], ['l', 'Large']], b.size || 'm', 'prop') +
             '<p class="help">Tip: a narrow space beside a block pushes it sideways.</p></div>';
    }

    h += '<div class="le-actions">' +
            '<button type="button" class="secondary le-small" id="leEarlier"' + (i === 0 ? ' disabled' : '') + '>◀ Earlier</button>' +
            '<button type="button" class="secondary le-small" id="leLater"' + (i === editForm.blocks.length - 1 ? ' disabled' : '') + '>Later ▶</button>' +
            '<button type="button" class="secondary le-small" id="leDup">Duplicate</button>' +
            '<button type="button" class="le-small le-danger" id="leDel">Remove</button>' +
         '</div>';
    box.innerHTML = h;

    box.querySelectorAll('[data-prop]').forEach(function (bt) {
        bt.addEventListener('click', function () {
            var prop = this.getAttribute('data-prop'), val = this.getAttribute('data-val');
            if (prop === 'w' || prop === 'cols') val = parseInt(val, 10);
            if (prop === 'shade') val = parseFloat(val);
            leSetProp(prop, val);
        });
    });
    var range = $('leWRange');
    if (range) {
        range.addEventListener('input', function () {
            var cell = document.querySelector('.le-cell[data-id="' + b._id + '"]');
            if (cell) { cell.style.setProperty('--w', this.value); cell.querySelector('.le-wl').textContent = leWidthLabel(+this.value); }
        });
        range.addEventListener('change', function () { leSetProp('w', parseInt(this.value, 10)); });
    }
    if ($('leFitRow')) $('leFitRow').addEventListener('click', function () { leSnapshot(); leEqualise(myRow, wProp); renderBlocks(); });
    box.querySelectorAll('[data-show]').forEach(function (cb) {
        cb.addEventListener('change', function () { leSetProp(this.getAttribute('data-show'), this.checked ? undefined : true); });
    });
    $('leNewRow').addEventListener('change', function () { leSetProp('newRow', this.checked); });
    box.querySelectorAll('[data-fmt]').forEach(function (bt) {
        bt.addEventListener('mousedown', function (e) { e.preventDefault(); });   // keep the text selection
        bt.addEventListener('click', function () { leFormat(b, this.getAttribute('data-fmt')); });
    });
    if ($('leCaptionIns')) $('leCaptionIns').addEventListener('input', function () {
        if (editForm.typing !== b._id + 'c') { leSnapshot(); editForm.typing = b._id + 'c'; leUndoButtons(); }
        b.caption = this.value;
        var inp = document.querySelector('.le-caption[data-id="' + b._id + '"]');
        if (inp) inp.value = this.value;
    });
    if ($('leZoom')) $('leZoom').addEventListener('change', function () { leSetProp('zoom', this.checked ? undefined : false); });
    if (b.type === 'carousel' || b.type === 'gallery') wireCarouselInspector(box, b);
    wirePhotoSlots(box, b);
    wireTextProps(box, b);
    if ($('leExif')) $('leExif').addEventListener('change', function () { leSetProp('exif', this.checked ? true : undefined); });
    if ($('leDropcap')) $('leDropcap').addEventListener('change', function () { leSetProp('dropcap', this.checked ? true : undefined); });
    if ($('leReplace')) $('leReplace').addEventListener('click', function () {
        openLibraryPicker(function (fn) {
            leSnapshot();
            delete b.file; delete b.previewUrl;
            b.src = fn.indexOf('/') === -1 ? 'images/Thumb/' + fn : fn;
            renderBlocks();
        });
    });
    $('leEarlier').addEventListener('click', function () { leMove(b, -1); });
    $('leLater').addEventListener('click', function () { leMove(b, 1); });
    $('leDup').addEventListener('click', function () {
        var c = {};
        Object.keys(b).forEach(function (k) { c[k] = b[k]; });
        if (b.slides) c.slides = b.slides.map(function (sl) { var o = {}; Object.keys(sl).forEach(function (k) { o[k] = sl[k]; }); return o; });
        ['before', 'after'].forEach(function (k) { if (b[k]) { var o = {}; Object.keys(b[k]).forEach(function (q) { o[q] = b[k][q]; }); c[k] = o; } });
        c._id = leId();
        leInsert([c], true);
    });
    $('leDel').addEventListener('click', function () { leRemove(b); });
}

function leSetProp(prop, val) {
    var b = leSelected();
    if (prop === 'w') { prop = leWProp(); if (!prop) return; }
    if (!b || b[prop] === val) return;
    leSnapshot();
    if (val === undefined) delete b[prop]; else b[prop] = val;
    renderBlocks();
}

/* Turn a size's own layout on (starting from what it shows now) or off. */
function leSetCustom(view, on) {
    if (!!editForm.layout.custom[view] === on) return;
    leSnapshot();
    editForm.layout.custom[view] = on;
    if (on) {
        var key = view === 'tablet' ? 'tw' : 'pw';
        editForm.blocks.forEach(function (b) { if (!b[key]) b[key] = leAutoW(b, view); });
    }
    renderBlocks();
}

/* Swap with the neighbouring block. Row starts stay where they are, so a
   block can step from one row into the next. */
function leMove(b, dir) {
    var i = leIndex(b._id), j = i + dir;
    if (j < 0 || j >= editForm.blocks.length) return;
    leSnapshot();
    var list = editForm.blocks, a = list[i], c = list[j];
    var aRow = a.newRow, cRow = c.newRow;
    list[i] = c; list[j] = a;
    c.newRow = aRow; a.newRow = cRow;
    renderBlocks();
}

function leRemove(b) {
    var i = leIndex(b._id);
    if (i === -1) return;
    leSnapshot();
    var next = editForm.blocks[i + 1];
    if (b.newRow && next && !next.newRow) next.newRow = true;
    editForm.blocks.splice(i, 1);
    editForm.sel = null;
    renderBlocks();
}

/* Wrap the selected words in **, * or a [link](…). */
function leFormat(b, kind) {
    var ta = document.querySelector('textarea.le-text[data-id="' + b._id + '"]');
    if (!ta) return;
    var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
    var picked = v.slice(s, e) || (kind === 'link' ? 'link text' : 'text');
    var out;
    if (kind === 'link') {
        var url = prompt('Link to (web address):', 'https://');
        if (!url || url === 'https://') return;
        out = '[' + picked + '](' + url.trim() + ')';
    } else {
        var mark = kind === 'bold' ? '**' : '*';
        out = mark + picked + mark;
    }
    leSnapshot();
    ta.value = v.slice(0, s) + out + v.slice(e);
    b.text = ta.value;
    ta.focus();
    ta.setSelectionRange(s, s + out.length);
    leGrow(ta);
    leUndoButtons();
}

/* What gets saved: rows of real content only, with the editor's temporary
   fields stripped and defaults left out to keep content.json tidy. */
function serializeLayoutBlocks() {
    var out = [];
    leRows().forEach(function (row) {
        var kept = row.map(function (b) {
            var o = { type: b.type, w: leClampW(b.w) };
            var custom = editForm.layout.custom || {};
            if (custom.tablet && b.tw) o.tw = leClampW(b.tw);
            if (custom.phone && b.pw) o.pw = leClampW(b.pw);
            if (b.hideD) o.hideD = true;
            if (b.hideT) o.hideT = true;
            if (b.hideP) o.hideP = true;
            if (b.valign && b.valign !== 'top') o.valign = b.valign;
            if (b.type === 'text') {
                if (!(b.text || '').trim()) return null;
                o.text = b.text;
                if (b.style && b.style !== 'body') o.style = b.style;
                if (b.align && b.align !== 'left') o.align = b.align;
                if (b.dropcap && (b.style || 'body') === 'body') o.dropcap = true;
            } else if (b.type === 'image') {
                o.src = b.file ? b._finalSrc : b.src;
                if (!o.src) return null;
                if (b.crop && b.crop !== 'original') o.crop = b.crop;
                if ((b.caption || '').trim()) o.caption = b.caption.trim();
                if (b.zoom === false) o.zoom = false;
                if (b.exif) o.exif = true;
            } else if (b.type === 'gallery') {
                o.slides = (b.slides || []).map(function (sl) {
                    var so = { src: sl.file ? sl._finalSrc : sl.src };
                    if ((sl.caption || '').trim()) so.caption = sl.caption.trim();
                    return so;
                }).filter(function (sl) { return sl.src; });
                if (!o.slides.length) return null;
                o.cols = b.cols || 3;
            } else if (b.type === 'compare') {
                var pic = function (sl) { return sl ? (sl.file ? sl._finalSrc : sl.src) : ''; };
                if (!pic(b.before) || !pic(b.after)) return null;
                o.before = { src: pic(b.before) };
                o.after = { src: pic(b.after) };
                o.crop = b.crop || 'landscape';
                if ((b.beforeLabel || '').trim()) o.beforeLabel = b.beforeLabel.trim();
                if ((b.afterLabel || '').trim()) o.afterLabel = b.afterLabel.trim();
            } else if (b.type === 'banner') {
                o.src = b.file ? b._finalSrc : b.src;
                if (!o.src) return null;
                if ((b.title || '').trim()) o.title = b.title.trim();
                if ((b.text || '').trim()) o.text = b.text.trim();
                o.place = b.place || 'center';
                o.shade = b.shade == null ? 0.35 : b.shade;
                o.crop = b.crop || 'wide';
            } else if (b.type === 'button') {
                if (!(b.label || '').trim() || !(b.href || '').trim()) return null;
                o.label = b.label.trim();
                o.href = b.href.trim();
                o.look = b.look || 'solid';
                o.align = b.align || 'center';
            } else if (b.type === 'carousel') {
                o.slides = (b.slides || []).map(function (sl) {
                    var so = { src: sl.file ? sl._finalSrc : sl.src };
                    if ((sl.caption || '').trim()) so.caption = sl.caption.trim();
                    return so;
                }).filter(function (sl) { return sl.src; });
                if (!o.slides.length) return null;
                o.crop = b.crop || 'landscape';
                if (b.fit === 'contain') o.fit = 'contain';
                if (b.autoplay) o.autoplay = true;
            } else if (b.type === 'spacer') {
                o.size = b.size || 'm';
            } else if (b.type !== 'divider') {
                return null;
            }
            return o;
        }).filter(Boolean);
        kept.forEach(function (o, k) { if (k === 0 && out.length) o.newRow = true; out.push(o); });
    });
    return out;
}

/* Which category the library picker was last filtered to ('all' or a key).
   Remembered while the Site Manager is open so reopening the picker keeps it. */
var libFilter = 'all';

/* Picker to reuse an existing photo (no new copy is stored).
   With no argument it appends an image block; given onPick it calls that with
   the chosen photo instead (used to set a project cover). `extras` adds images
   that aren't in the portfolio - a project's own uploads, for its cover. Each
   item hands back either a bare portfolio filename or a full repo path, both of
   which projCoverSrc and the site's projectImageSrc already understand.
   Category buttons along the top narrow the grid to one category. */
function openLibraryPicker(onPick, extras, keepOpen) {
    var holder = $('libraryPicker');
    var photos = state.content.portfolio || [];
    // Only offer categories that actually have photos in them.
    var cats = (state.content.categories || []).filter(function (c) {
        return c.key && photos.some(function (p) { return p.category === c.key; });
    });
    if (libFilter !== 'all' && !cats.some(function (c) { return c.key === libFilter; })) libFilter = 'all';

    var extraItems = (extras || []).map(function (e) {
        return '<button class="lib-item" data-fn="' + escapeHtml(e.value) + '">' +
               '<img src="' + rawSrc(e.value) + '" alt="" loading="lazy">' +
               '<span>' + escapeHtml(e.label) + '</span></button>';
    }).join('');
    var filterBtns = ['<button class="cat-btn lib-cat" data-cat="all">All</button>'].concat(cats.map(function (c) {
        return '<button class="cat-btn lib-cat" data-cat="' + escapeHtml(c.key) + '"' +
               (c.hidden ? ' title="Not shown on the Portfolio page"' : '') + '>' +
               escapeHtml(c.label || c.key) + '</button>';
    })).join('');

    holder.innerHTML =
        '<div class="lib-head"><span>' + (onPick && !keepOpen ? 'Choose a photo' : 'Click photos to add them, in order — then Done') + '</span>' +
            '<button class="link" id="libClose">Close</button></div>' +
        (extraItems ? '<div class="lib-sub">From this project</div><div class="lib-grid">' + extraItems + '</div>' +
                      '<div class="lib-sub">From the library</div>' : '') +
        '<div class="cat-filter lib-filter">' + filterBtns + '</div>' +
        '<div class="lib-grid" id="libGrid">' +
            photos.map(function (p) {
                return '<button class="lib-item" data-fn="' + escapeHtml(p.filename) + '" data-category="' + escapeHtml(p.category || '') + '">' +
                       '<img src="' + imgSrc(p.filename) + '" alt="" loading="lazy">' +
                       '<span>' + escapeHtml(p.title) + '</span></button>';
            }).join('') +
        '</div>';
    holder.classList.remove('hidden');

    function applyLibFilter() {
        holder.querySelectorAll('.lib-cat').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-cat') === libFilter);
        });
        $('libGrid').querySelectorAll('.lib-item').forEach(function (it) {
            it.classList.toggle('hidden', libFilter !== 'all' && it.getAttribute('data-category') !== libFilter);
        });
        $('libGrid').scrollTop = 0;
    }
    holder.querySelectorAll('.lib-cat').forEach(function (b) {
        b.addEventListener('click', function () { libFilter = this.getAttribute('data-cat'); applyLibFilter(); });
    });
    applyLibFilter();

    $('libClose').addEventListener('click', function () { holder.classList.add('hidden'); holder.innerHTML = ''; });
    // Adding to a post/project: the picker stays open so several photos can be
    // picked in a row; each one joins the same row (Photos per row sets widths).
    var picked = 0;
    holder.querySelectorAll('.lib-item').forEach(function (bt) {
        bt.addEventListener('click', function () {
            var fn = this.getAttribute('data-fn');
            if (onPick && keepOpen) {
                onPick(fn);
                this.classList.add('lib-picked');
                $('libClose').textContent = 'Done';
                return;
            }
            if (onPick) { holder.classList.add('hidden'); holder.innerHTML = ''; onPick(fn); return; }
            var src = fn.indexOf('/') === -1 ? 'images/Thumb/' + fn : fn;
            leInsert([leImageBlock({ src: src }, picked)], picked > 0);
            picked++;
            this.classList.add('lib-picked');
            $('libClose').textContent = 'Done';
        });
    });
}

/* ----------------------------------------------------------
   UPLOADS JOIN THE LIBRARY
   A photo uploaded inside a blog post or project is added to the
   photo library (full size + thumbnail + EXIF, exactly like the
   Photos tab's "Add photo"). A project's uploads get a category
   named after the project; every blog post's uploads share one
   "Blog" category (marked role: 'blog'). The post/project remembers
   its category key in photo_category. Photos are titled
   "<title> N", numbered per post/project. The category starts hidden: it is listed
   and editable in the Photos and Categories tabs like any other,
   but the Portfolio page leaves it out until it is set to show.
   ---------------------------------------------------------- */

/* Projects each get their own category, named after the project. Blog posts
   all share one "Blog" category, found by role: 'blog' so it can be renamed. */
function libraryCategoryFor(title, prevKey, kind) {
    ensureCategories();
    var cats = state.content.categories;
    if (kind === 'blog') {
        var shared = cats.filter(function (c) { return c.role === 'blog' && c.key; })[0];
        if (shared) return shared.key;
        title = 'Blog';
    } else if (prevKey && cats.some(function (c) { return c.key === prevKey; })) {
        return prevKey;
    }
    var used = {};
    cats.forEach(function (c) { if (c.key) used[c.key] = true; });
    var key = uniqueKey(slugify(title), used);
    var cat = { key: key, label: title, hidden: true };
    if (kind === 'blog') cat.role = 'blog';
    cats.push(cat);
    if (state.catOriginalLabels) state.catOriginalLabels[key] = title;
    return key;
}

/* Highest N among library photos already titled "<title> N", so numbering
   carries on per post/project even when they share a category. */
function lastPhotoNumber(title) {
    var prefix = title + ' ', max = 0;
    (state.content.portfolio || []).forEach(function (p) {
        var t = p.title || '';
        if (t.indexOf(prefix) === 0 && /^\d+$/.test(t.slice(prefix.length))) {
            max = Math.max(max, parseInt(t.slice(prefix.length), 10));
        }
    });
    return max;
}

/* Turn every newly uploaded image block into a library photo. Pushes the image
   files onto `upserts`, adds the photos to state.content.portfolio and points
   each block at its thumbnail. Resolves to the category key used (or prevKey
   when there was nothing new to upload). */
function addUploadsToLibrary(title, prevKey, upserts, status) {
    // A duplicated photo block shares its file with the original: upload it once.
    var withFile = leFileItems();
    var uploads = withFile.filter(function (b, i) {
        for (var j = 0; j < i; j++) if (withFile[j].file === b.file) return false;
        return true;
    });
    if (!uploads.length) return Promise.resolve(prevKey || '');

    var key = libraryCategoryFor(title, prevKey, editForm.kind);
    var taken = {};
    Object.keys(state.byFilename).forEach(function (fn) { taken[fn] = true; });
    var n = lastPhotoNumber(title);
    var chain = Promise.resolve();

    uploads.forEach(function (b, i) {
        chain = chain.then(function () {
            showStatus(status, 'Preparing photo ' + (i + 1) + ' of ' + uploads.length + '…', 'ok');
            n++;
            var photoTitle = title + ' ' + n;
            var filename = uniqueFilename(slugify(photoTitle), '.jpg', taken);
            taken[filename] = true;
            var meta, fullB64;
            return readExif(b.file)
                .then(function (m) { meta = m || {}; return fileToBase64(b.file); })
                .then(function (b64) { fullB64 = b64; return makeThumb(b.file, THUMB_MAX_EDGE); })
                .then(fileToBase64)
                .then(function (thumbB64) {
                    upserts.push({ path: 'images/Full res/' + filename, base64: fullB64 });
                    upserts.push({ path: 'images/Thumb/' + filename, base64: thumbB64 });
                    var photo = {
                        filename: filename, title: photoTitle, category: key, featured: false,
                        camera: meta.camera || '', lens: meta.lens || '', focal: meta.focal || '',
                        shutter: meta.shutter || '', aperture: meta.aperture || '',
                        iso: meta.iso || '', date: meta.date || ''
                    };
                    if (!state.content.portfolio) state.content.portfolio = [];
                    state.content.portfolio.push(photo);
                    state.byFilename[filename] = photo;
                    b._finalSrc = 'images/Thumb/' + filename;
                });
        });
    });
    return chain.then(function () {
        withFile.forEach(function (b) {
            if (b._finalSrc) return;
            for (var j = 0; j < uploads.length; j++) if (uploads[j].file === b.file) b._finalSrc = uploads[j]._finalSrc;
        });
        return key;
    });
}

/* Every photo waiting to be uploaded: photo blocks and carousel slides. */
function leFileItems() {
    var out = [];
    editForm.blocks.forEach(function (b) {
        if ((b.type === 'image' || b.type === 'banner') && b.file) out.push(b);
        (b.slides || []).forEach(function (sl) { if (sl.file) out.push(sl); });
        ['before', 'after'].forEach(function (k) { if (b[k] && b[k].file) out.push(b[k]); });
    });
    return out;
}

/* A failed save may already have added photos/categories to the in-memory
   content. Re-read what is really saved so a retry starts clean; the open
   form (and its not-yet-uploaded images) is left as it is. */
function restoreAfterFailedSave() {
    var holder = editForm;
    editForm = null;   // keep loadContent's re-render from touching the form
    return ghGetFile('content.json').then(function (file) {
        state.content = JSON.parse(file.text);
        state.byFilename = {};
        (state.content.portfolio || []).forEach(function (p) { state.byFilename[p.filename] = p; });
        state.featured = (state.content.featured_images || []).slice();
        ensureCategories();
    }).catch(function () {}).then(function () {
        editForm = holder;
        if (editForm) leFileItems().forEach(function (b) { delete b._finalSrc; });
    });
}

function savePost() {
    syncBlockInputs();
    var status = $('pfStatus');
    var title = $('pfTitle').value.trim();
    if (!title) { showStatus(status, 'Please give the post a title.', 'error'); return; }
    var date = $('pfDate').value.trim();

    $('pfSave').disabled = true;
    showStatus(status, 'Preparing…', 'ok');

    var upserts = [];
    var prevPost = editForm.index === null ? null : state.content.blog[editForm.index];
    var photoCategory = '';

    addUploadsToLibrary(title, prevPost && prevPost.photo_category, upserts, status).then(function (key) {
        photoCategory = key;
        showStatus(status, 'Saving…', 'ok');
        var blocks = serializeLayoutBlocks();

        if (!state.content.blog) state.content.blog = [];
        var post = { title: title, date: date, layout: editForm.layout, blocks: blocks };
        if ($('pfVisibility').value === 'draft') post.status = 'draft';
        if (photoCategory) post.photo_category = photoCategory;
        if (editForm.index === null) state.content.blog.unshift(post);
        else state.content.blog[editForm.index] = post;
        upserts.push({ path: 'content.json', base64: contentToBase64(state.content) });
        return commitChanges({
            message: (editForm.index === null ? 'Add' : 'Update') + ' blog post "' + title + '" via Site Manager',
            upserts: upserts
        });
    }).then(function () {
        leClearBackup();
        editForm = null;
        return loadContent();
    }).then(function () {
        blogFlash('✓ Saved. The site will update within about a minute.', 'ok');
    }).catch(function (err) {
        showStatus(status, 'Could not save: ' + err.message, 'error');
        if ($('pfSave')) $('pfSave').disabled = false;
        restoreAfterFailedSave();
    });
}

function moveBlogPost(i, dir) {
    var b = state.content.blog, j = i + dir;
    if (j < 0 || j >= b.length) return;
    var t = b[i]; b[i] = b[j]; b[j] = t;
    blogFlash('Saving order…', 'ok');
    commitChanges({
        message: 'Reorder blog posts via Site Manager',
        upserts: [{ path: 'content.json', base64: contentToBase64(state.content) }]
    }).then(function () { return loadContent(); })
      .then(function () { blogFlash('✓ Order saved.', 'ok'); })
      .catch(function (err) { blogFlash('Could not reorder: ' + err.message, 'error'); });
}

function deletePost(index) {
    var post = state.content.blog[index];
    if (!confirm('Delete blog post "' + (post.title || '') + '"? (Recoverable from version history.)')) return;
    blogFlash('Deleting…', 'ok');
    // Only remove images this post actually owns (uploaded into images/Blog/),
    // never a reused portfolio photo referenced from images/Thumb/.
    var deletes = [];
    if (post.blocks) post.blocks.forEach(function (b) {
        if (b.type !== 'image') return;
        var src = b.src || (b.filename ? 'images/Blog/' + b.filename : '');
        if (src.indexOf('images/Blog/') === 0) deletes.push(src);
    });
    (post.images || []).forEach(function (n) { deletes.push('images/Blog/' + n); });
    state.content.blog.splice(index, 1);
    commitChanges({
        message: 'Delete blog post via Site Manager',
        upserts: [{ path: 'content.json', base64: contentToBase64(state.content) }],
        deletes: deletes
    }).then(function () { return loadContent(); })
      .then(function () { blogFlash('✓ Deleted.', 'ok'); })
      .catch(function (err) { blogFlash('Could not delete: ' + err.message, 'error'); });
}


/* ----------------------------------------------------------
   PAGE TEXT
   Prose that stays hardcoded in the HTML (for SEO / no flash) is edited
   in place between <!-- edit:NAME --> markers. The hero title/tagline
   live in content.json settings and are injected by script.js.
   ---------------------------------------------------------- */

var TEXT_FIELDS = [
    { id: 'site_name', label: 'Home page title (hero)', kind: 'setting', key: 'site_name',
      help: 'The large title on the home page.' },
    { id: 'tagline', label: 'Home page tagline (hero)', kind: 'setting', key: 'tagline' },
    { id: 'about_heading', label: 'About page heading', kind: 'html', file: 'about.html', marker: 'about-heading' },
    { id: 'about_sub', label: 'About page subheading', kind: 'html', file: 'about.html', marker: 'about-sub' },
    { id: 'about_bio', label: 'About bio', kind: 'html', file: 'about.html', marker: 'about-bio', multiline: true, rows: 6,
      help: 'Leave a blank line between paragraphs.' },
    { id: 'portfolio_blurb', label: 'Portfolio blurb', kind: 'html', file: 'portfolio.html', marker: 'portfolio-blurb', multiline: true, rows: 4,
      help: 'The Contact link below this text is kept automatically.' },
    { id: 'projects_intro', label: 'Projects page intro', kind: 'html', file: 'projects.html', marker: 'projects-intro', multiline: true, rows: 3 }
];

function textFlash(msg, type) { var el = $('textStatus'); if (el) showStatus(el, msg, type); }

function stripTags(s) { return s.replace(/<[^>]*>/g, ''); }
function unescapeHtml(s) {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function extractRegion(text, marker) {
    var m = text.match(new RegExp('<!-- edit:' + marker + ' -->([\\s\\S]*?)<!-- /edit:' + marker + ' -->'));
    return m ? m[1] : null;
}
function replaceRegion(text, marker, inner) {
    var re = new RegExp('(<!-- edit:' + marker + ' -->)[\\s\\S]*?(<!-- /edit:' + marker + ' -->)');
    return text.replace(re, function (_, open, close) { return open + inner + close; });
}

/* HTML region -> plain text for editing. */
function regionToPlain(inner, multiline) {
    if (multiline) {
        var paras = [], re = /<p[^>]*>([\s\S]*?)<\/p>/gi, m;
        while ((m = re.exec(inner))) paras.push(unescapeHtml(stripTags(m[1])).trim());
        if (paras.length) return paras.join('\n\n');
    }
    return unescapeHtml(stripTags(inner)).trim();
}

/* Plain text -> HTML region for saving. */
function plainToRegion(plain, multiline) {
    if (multiline) {
        var paras = plain.split(/\n\n+/).map(function (p) { return p.trim(); }).filter(Boolean);
        return '\n        ' + paras.map(function (p) {
            return '<p>' + escapeHtml(p).replace(/\n/g, '<br>') + '</p>';
        }).join('\n        ') + '\n        ';
    }
    return escapeHtml(plain.trim());
}

function textFilePaths() {
    var paths = TEXT_FIELDS.filter(function (f) { return f.kind === 'html'; }).map(function (f) { return f.file; });
    return paths.filter(function (p, i) { return paths.indexOf(p) === i; });
}

function loadTextPanel() {
    var body = $('panelBody');
    body.innerHTML = '<div class="placeholder">Loading page text…</div>';
    var files = {};
    Promise.all(textFilePaths().map(function (p) {
        return ghGetFile(p).then(function (f) { files[p] = f.text; });
    })).then(function () {
        var values = {};
        TEXT_FIELDS.forEach(function (f) {
            if (f.kind === 'setting') {
                values[f.id] = (state.content.settings && state.content.settings[f.key]) || '';
            } else {
                var inner = extractRegion(files[f.file], f.marker);
                values[f.id] = inner == null ? '' : regionToPlain(inner, f.multiline);
            }
        });
        renderTextPanel(values);
    }).catch(function (err) {
        body.innerHTML = '<div class="status error">' + err.message + '</div>';
    });
}

function renderTextPanel(values) {
    var fields = TEXT_FIELDS.map(function (f) {
        var input = f.multiline
            ? '<textarea id="tf_' + f.id + '" rows="' + (f.rows || 5) + '">' + escapeHtml(values[f.id]) + '</textarea>'
            : '<input type="text" id="tf_' + f.id + '" value="' + escapeHtml(values[f.id]) + '">';
        return '<div class="tf-field"><label for="tf_' + f.id + '">' + f.label + '</label>' + input +
               (f.help ? '<span class="help">' + f.help + '</span>' : '') + '</div>';
    }).join('');

    $('panelBody').innerHTML =
        '<div class="text-status status hidden" id="textStatus"></div>' +
        '<div class="text-form">' + fields +
            '<div class="af-actions"><button id="saveTextBtn">Save page text</button></div>' +
        '</div>';

    $('saveTextBtn').addEventListener('click', saveText);
}

function saveText() {
    $('saveTextBtn').disabled = true;
    textFlash('Saving…', 'ok');

    var files = {};
    Promise.all(textFilePaths().map(function (p) {
        return ghGetFile(p).then(function (f) { files[p] = f.text; });
    })).then(function () {
        TEXT_FIELDS.forEach(function (f) {
            var val = $('tf_' + f.id).value;
            if (f.kind === 'html') {
                files[f.file] = replaceRegion(files[f.file], f.marker, plainToRegion(val, f.multiline));
            } else {
                if (!state.content.settings) state.content.settings = {};
                state.content.settings[f.key] = val.trim();
            }
        });
        var upserts = [{ path: 'content.json', base64: contentToBase64(state.content) }];
        textFilePaths().forEach(function (p) { upserts.push({ path: p, base64: b64EncodeUnicode(files[p]) }); });
        return commitChanges({ message: 'Update page text via Site Manager', upserts: upserts });
    }).then(function () {
        textFlash('✓ Saved. The site will update within about a minute.', 'ok');
    }).catch(function (err) {
        textFlash('Could not save: ' + err.message, 'error');
    }).then(function () {
        if ($('saveTextBtn')) $('saveTextBtn').disabled = false;
    });
}


/* ----------------------------------------------------------
   CONNECT / LOGIN
   ---------------------------------------------------------- */

function connect(token) {
    setToken(token);
    var status = $('loginStatus');
    showStatus(status, 'Checking…', 'ok');
    return loadContent().then(function () {
        status.classList.add('hidden');
        showApp();
    }).catch(function (err) {
        clearToken();
        showStatus(status, err.message, 'error');
    });
}


/* ----------------------------------------------------------
   WIRE UP
   ---------------------------------------------------------- */

document.addEventListener('DOMContentLoaded', function () {
    renderBranchBanner();

    document.querySelectorAll('.tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            var wrap = document.querySelector('.wrap');
            if (wrap) wrap.classList.remove('wide', 'editing');   // only Arrange / the layout editor widen the page
            editForm = null;   // switching tabs closes any open post/project form
            var which = tab.getAttribute('data-tab');
            if (which === 'photos') {
                if (state.content) renderPhotos();
            } else if (which === 'hero') {
                loadHeroPanel();
            } else if (which === 'blog') {
                loadBlogPanel();
            } else if (which === 'text') {
                loadTextPanel();
            } else if (which === 'categories') {
                loadCategoriesPanel();
            } else if (which === 'projects') {
                loadProjectsPanel();
            } else {
                $('panelBody').innerHTML = '<div class="placeholder">This section is coming in a later phase.</div>';
            }
        });
    });

    $('connectBtn').addEventListener('click', function () {
        var token = $('tokenInput').value.trim();
        if (!token) { showStatus($('loginStatus'), 'Please paste your token first.', 'error'); return; }
        connect(token);
    });
    $('tokenInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') $('connectBtn').click();
    });
    $('disconnectBtn').addEventListener('click', function () {
        clearToken(); $('tokenInput').value = ''; showLogin();
    });

    if (getToken()) {
        showApp();
        loadContent().catch(function () { showLogin(); });
    } else {
        showLogin();
    }
});


/* ----------------------------------------------------------
   PROJECTS
   Stored in content.json as projects: [{ slug, title, subtitle,
   cover, status, blocks }]. The site has one project.html page
   that renders whichever project the ?p=<slug> in the URL names,
   so adding a project here never needs a new file.

   Uses the same block editor as the blog; only the surrounding
   fields (slug, cover, status) differ. Images uploaded into a
   project go to images/Projects/.
   ---------------------------------------------------------- */

function projFlash(msg, type) { var el = $('projStatus'); if (el) showStatus(el, msg, type); }

function loadProjectsPanel() {
    if (!state.content.projects) state.content.projects = [];
    renderProjectsPanel();
}

/* A cover is either a bare portfolio filename (images/Thumb/) or a full path. */
function projCoverSrc(cover) {
    if (!cover) return '';
    return cover.indexOf('/') === -1 ? imgSrc(cover) : rawSrc(cover);
}

/* Slug must be unique across projects — it is the project's page address. */
function uniqueSlug(base, skipIndex) {
    // slugify() falls back to 'photo', which is meaningless for a project page.
    base = (base || '').trim() ? slugify(base) : 'project';
    var used = {};
    (state.content.projects || []).forEach(function (p, i) {
        if (i !== skipIndex && p.slug) used[p.slug] = true;
    });
    var slug = base, n = 2;
    while (used[slug]) { slug = base + '-' + n; n++; }
    return slug;
}

function renderProjectsPanel() {
    var projects = state.content.projects || [];
    var rows = projects.map(function (proj, i) {
        var cover = projCoverSrc(proj.cover);
        var thumb = cover ? '<img src="' + cover + '" alt="">' : '<div class="noimg">No cover</div>';
        var isDraft = proj.status === 'draft';
        return '' +
        '<div class="blog-row proj-row" data-index="' + i + '">' +
            '<span class="reorder">' +
                '<button class="up" title="Move up">▲</button>' +
                '<button class="down" title="Move down">▼</button>' +
            '</span>' +
            '<div class="blog-thumb">' + thumb + '</div>' +
            '<div class="blog-rowmeta">' +
                '<span class="blog-rowtitle">' + escapeHtml(proj.title || '(untitled)') +
                    (isDraft ? ' <span class="badge draft">draft</span>' : '') + '</span>' +
                '<span class="blog-rowdate">' + (isDraft ? 'not published yet'
                    : '/project/' + escapeHtml(proj.slug || '') + '/') + '</span>' +
            '</div>' +
            '<button class="proj-edit blog-edit">Edit</button>' +
            '<button class="proj-del remove">Delete</button>' +
        '</div>';
    }).join('');

    $('panelBody').innerHTML =
        '<div class="blog-status status hidden" id="projStatus"></div>' +
        '<div class="photo-toolbar"><button id="newProjBtn">+ New project</button></div>' +
        '<div class="post-form-holder" id="projFormHolder"></div>' +
        '<div class="blog-list">' +
            (rows || '<div class="placeholder">No projects yet. Click “New project” to start one.</div>') +
        '</div>' +
        '<p class="help">Projects appear on the Projects page in this order. A draft is hidden from ' +
        'the site until you set it to Published — use Preview to check it first.</p>';

    $('newProjBtn').addEventListener('click', function () { openProjectForm(null); });
    document.querySelectorAll('.proj-row').forEach(function (row) {
        var i = parseInt(row.getAttribute('data-index'), 10);
        row.querySelector('.up').addEventListener('click', function () { moveProject(i, -1); });
        row.querySelector('.down').addEventListener('click', function () { moveProject(i, 1); });
        row.querySelector('.proj-edit').addEventListener('click', function () { openProjectForm(i); });
        row.querySelector('.proj-del').addEventListener('click', function () { deleteProject(i); });
    });
}

function openProjectForm(index) {
    var proj = (index === null)
        ? { title: '', subtitle: '', slug: '', cover: '', status: 'draft', blocks: [] }
        : state.content.projects[index];
    editForm = {
        kind: 'project', index: index, blocks: postToEditBlocks(proj), layout: editLayoutFor(proj),
        cover: proj.cover || '', sel: null, undo: [], redo: [], view: 'laptop', perRow: 2
    };

    $('projFormHolder').innerHTML =
        '<div class="add-form">' +
            '<div class="af-grid">' +
                '<div class="af-field"><label for="prTitle">Title</label>' +
                    '<input type="text" id="prTitle" value="' + escapeHtml(proj.title || '') + '"></div>' +
                '<div class="af-field"><label for="prSubtitle">Subtitle (optional)</label>' +
                    '<input type="text" id="prSubtitle" value="' + escapeHtml(proj.subtitle || '') + '"></div>' +
                '<div class="af-field"><label for="prSlug">Page address</label>' +
                    '<input type="text" id="prSlug" value="' + escapeHtml(proj.slug || '') + '" placeholder="made from the title">' +
                    '<span class="help">The end of the project’s web address. Changing it breaks any link already shared.</span></div>' +
                '<div class="af-field"><label for="prVisibility">Visibility</label>' +
                    '<select id="prVisibility">' +
                        '<option value="draft"' + (proj.status === 'draft' ? ' selected' : '') + '>Draft — hidden from the site</option>' +
                        '<option value="published"' + (proj.status !== 'draft' ? ' selected' : '') + '>Published — visible to everyone</option>' +
                    '</select></div>' +
            '</div>' +
            '<div class="af-row"><label>Cover photo (shown on the Projects page)</label>' +
                '<div class="proj-cover" id="prCoverBox"></div></div>' +
            layoutEditorHTML('project') +
            '<div class="af-actions">' +
                '<button id="prSave">Save project</button>' +
                '<button class="secondary" id="prPreview">Preview</button>' +
                '<button class="secondary" id="prCancel">Cancel</button>' +
            '</div>' +
            '<div class="status hidden" id="prFormStatus"></div>' +
        '</div>';

    $('prSave').addEventListener('click', saveProject);
    $('prPreview').addEventListener('click', previewProject);
    $('prCancel').addEventListener('click', function () { closeLayoutEditor('projFormHolder'); });
    renderProjectCover();
    initLayoutEditor();
    $('projFormHolder').scrollIntoView({ block: 'nearest' });
}

/* The cover chooser inside the project form. */
function renderProjectCover() {
    var box = $('prCoverBox');
    if (!box) return;
    var cover = projCoverSrc(editForm.cover);
    box.innerHTML =
        (cover ? '<img class="proj-cover-thumb" src="' + cover + '" alt="">'
               : '<div class="noimg">No cover chosen</div>') +
        '<div class="proj-cover-btns">' +
            '<button class="secondary" id="prCoverPick">' + (cover ? 'Change' : 'Choose') + ' cover</button>' +
            (cover ? '<button class="secondary" id="prCoverClear">Remove</button>' : '') +
        '</div>';
    $('prCoverPick').addEventListener('click', function () {
        openLibraryPicker(function (fn) { editForm.cover = fn; renderProjectCover(); }, projectOwnImages());
    });
    if ($('prCoverClear')) {
        $('prCoverClear').addEventListener('click', function () { editForm.cover = ''; renderProjectCover(); });
    }
}

/* Images uploaded into THIS project, offered as cover options alongside the
   portfolio. Blocks added in this session have no path until the project is
   saved, so they can't be a cover yet. */
function projectOwnImages() {
    var dir = BLOCK_IMAGE_DIRS.project;
    var out = [];
    (editForm && editForm.blocks || []).forEach(function (b, i) {
        if (b.type === 'image' && b.src && b.src.indexOf(dir) === 0) {
            out.push({ value: b.src, label: 'Image ' + (i + 1) });
        }
    });
    return out;
}

/* Open the live project page with ?preview=1, which shows drafts too.
   Unsaved edits are not included — it previews what is saved. */
function previewProject() {
    var slug = $('prSlug').value.trim() || slugify($('prTitle').value.trim());
    if (!slug) { showStatus($('prFormStatus'), 'Give the project a title first.', 'error'); return; }
    if (editForm.index === null) {
        showStatus($('prFormStatus'), 'Save the project once before previewing it.', 'error');
        return;
    }
    // A published project has a real page; a draft is only viewable through the
    // preview renderer. Either way this shows what is SAVED, not unsaved edits.
    var published = $('prVisibility').value === 'published';
    var url = published
        ? projectPageUrl(slug)
        : 'https://stonemanphotography.co.uk/project.html?p=' + encodeURIComponent(slug) + '&preview=1';
    window.open(url, '_blank');
}

function saveProject() {
    syncBlockInputs();
    var status = $('prFormStatus');
    var title = $('prTitle').value.trim();
    if (!title) { showStatus(status, 'Please give the project a title.', 'error'); return; }

    var index = editForm.index;
    var slug = uniqueSlug($('prSlug').value.trim() || title, index === null ? -1 : index);

    $('prSave').disabled = true;
    showStatus(status, 'Preparing…', 'ok');

    var upserts = [];
    var prevProj = index === null ? null : state.content.projects[index];
    var photoCategory = '';

    addUploadsToLibrary(title, prevProj && prevProj.photo_category, upserts, status).then(function (key) {
        photoCategory = key;
        showStatus(status, 'Saving…', 'ok');
        var blocks = serializeLayoutBlocks();

        if (!state.content.projects) state.content.projects = [];
        var proj = {
            slug: slug,
            title: title,
            subtitle: $('prSubtitle').value.trim(),
            cover: editForm.cover || '',
            status: $('prVisibility').value === 'published' ? 'published' : 'draft',
            layout: editForm.layout,
            blocks: blocks
        };
        if (photoCategory) proj.photo_category = photoCategory;
        // What this project looked like before this save, so we know which page
        // file (if any) is now stale.
        var prev = index === null ? null : state.content.projects[index];
        var deletes = [];
        if (prev && prev.slug && prev.status !== 'draft' &&
            (prev.slug !== proj.slug || proj.status === 'draft')) {
            deletes.push(projectPagePath(prev.slug));
        }

        if (index === null) state.content.projects.unshift(proj);
        else state.content.projects[index] = proj;

        // A published project has its own page; a draft deliberately has none.
        if (proj.status !== 'draft') {
            upserts.push({ path: projectPagePath(proj.slug), base64: b64EncodeUnicode(buildProjectPage(proj)) });
        }
        upserts.push({ path: 'content.json', base64: contentToBase64(state.content) });

        return sitemapUpsert(state.content.projects).then(function (sm) {
            if (sm) upserts.push(sm);
            return commitChanges({
                message: (index === null ? 'Add' : 'Update') + ' project "' + title + '" via Site Manager',
                upserts: upserts,
                deletes: deletes
            });
        });
    }).then(function () {
        leClearBackup();
        editForm = null;
        return loadContent();
    }).then(function () {
        projFlash('✓ Saved. The site will update within about a minute.', 'ok');
    }).catch(function (err) {
        showStatus(status, 'Could not save: ' + err.message, 'error');
        if ($('prSave')) $('prSave').disabled = false;
        restoreAfterFailedSave();
    });
}

function moveProject(i, dir) {
    var list = state.content.projects, j = i + dir;
    if (j < 0 || j >= list.length) return;
    var t = list[i]; list[i] = list[j]; list[j] = t;
    projFlash('Saving order…', 'ok');
    commitChanges({
        message: 'Reorder projects via Site Manager',
        upserts: [{ path: 'content.json', base64: contentToBase64(state.content) }]
    }).then(loadContent)
      .then(function () { projFlash('✓ Order saved.', 'ok'); })
      .catch(function (err) { projFlash('Could not reorder: ' + err.message, 'error'); });
}

function deleteProject(index) {
    var proj = state.content.projects[index];
    if (!proj) return;
    if (!window.confirm('Delete the project “' + (proj.title || 'untitled') + '”? (Recoverable from version history.)')) return;

    // Only delete images this project owns (uploaded into images/Projects/).
    // Reused portfolio photos are left alone — they belong to the gallery.
    var dir = BLOCK_IMAGE_DIRS.project;
    var deletes = [];
    (proj.blocks || []).forEach(function (b) {
        if (b.src && b.src.indexOf(dir) === 0) deletes.push(b.src);
    });
    if (proj.cover && proj.cover.indexOf(dir) === 0) deletes.push(proj.cover);

    // Published projects have a page of their own; drafts never do.
    if (proj.slug && proj.status !== 'draft') deletes.push(projectPagePath(proj.slug));

    state.content.projects.splice(index, 1);
    projFlash('Deleting…', 'ok');
    sitemapUpsert(state.content.projects).then(function (sm) {
        var upserts = [{ path: 'content.json', base64: contentToBase64(state.content) }];
        if (sm) upserts.push(sm);
        return commitChanges({
            message: 'Delete project "' + (proj.title || 'untitled') + '" via Site Manager',
            upserts: upserts,
            deletes: deletes
        });
    }).then(loadContent)
      .then(function () { projFlash('✓ Deleted.', 'ok'); })
      .catch(function (err) { projFlash('Could not delete: ' + err.message, 'error'); });
}


/* ----------------------------------------------------------
   PROJECT PAGES
   Every PUBLISHED project gets its own real page committed at
   project/<slug>/index.html, so it has a proper web address, its
   own title and a tidy link to share.

   The page is a thin shell: the title/description/canonical are
   baked in for search engines and link previews, but the content
   itself is still rendered from content.json by script.js (the
   slug is in data-project). That way a project's words and photos
   live in exactly one place and the page can never drift out of
   date with content.json.

   A draft has no page at all — it is previewed through
   project.html?p=<slug>&preview=1 instead.
   ---------------------------------------------------------- */

function projectPagePath(slug) {
    return 'project/' + slug + '/index.html';
}

function projectPageUrl(slug) {
    return 'https://stonemanphotography.co.uk/project/' + slug + '/';
}

/* First line of the first text block, for the meta description. */
function projectSummary(proj) {
    var text = '';
    (proj.blocks || []).forEach(function (b) {
        if (!text && b.type === 'text' && (b.text || '').trim()) text = b.text.trim();
    });
    // Drop the editor's **bold** / *italic* / [link](url) marks.
    text = text.replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1').replace(/\*\*?([^*]+)\*\*?/g, '$1');
    text = text.replace(/\s+/g, ' ');
    if (text.length > 155) text = text.slice(0, 152).replace(/\s+\S*$/, '') + '…';
    return text || (proj.title + ' — a photography project by Stoneman Photography.');
}

/* The generated page. <base href="/"> lets it sit in a subfolder while every
   relative path inside (css, js, images, content.json, nav links) still
   resolves from the site root, exactly as on the top-level pages. */
function buildProjectPage(proj) {
    var title = escapeHtml(proj.title) + ' | Stoneman Photography';
    var desc = escapeHtml(projectSummary(proj));
    var url = projectPageUrl(proj.slug);
    var cover = proj.cover
        ? 'https://stonemanphotography.co.uk/' +
          (proj.cover.indexOf('/') === -1 ? 'images/Thumb/' + proj.cover : proj.cover)
              .split('/').map(encodeURIComponent).join('/')
        : '';

    return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'    <!-- Generated by the Site Manager. Edit this project in the Projects tab,\n' +
'         not here: saving the project rewrites this file. -->\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'    <base href="/">\n' +
'    <meta name="description" content="' + desc + '">\n' +
'    <title>' + title + '</title>\n' +
'\n' +
'    <link rel="stylesheet" href="css/style.css?v=4">\n' +
'\n' +
'    <link rel="icon" type="image/png" href="/favicon-512.png">\n' +
'    <link rel="apple-touch-icon" href="/favicon-512.png">\n' +
'\n' +
'    <meta property="og:title" content="' + title + '">\n' +
'    <meta property="og:description" content="' + desc + '">\n' +
'    <meta property="og:type" content="article">\n' +
'    <meta property="og:url" content="' + url + '">\n' +
(cover ? '    <meta property="og:image" content="' + cover + '">\n' : '') +
'    <link rel="canonical" href="' + url + '">\n' +
'</head>\n' +
'<body class="dark-page">\n' +
'\n' +
'    <!-- ======== NAVIGATION ======== -->\n' +
'    <nav>\n' +
'        <div class="nav-container">\n' +
'            <a href="index.html" class="logo">Stoneman Photography</a>\n' +
'            <button class="menu-toggle" aria-label="Toggle menu" aria-expanded="false">&#9776;</button>\n' +
'            <ul class="nav-links">\n' +
'                <li><a href="index.html">Home</a></li>\n' +
'                <li><a href="portfolio.html">Portfolio</a></li>\n' +
'                <li><a href="projects.html">Projects</a></li>\n' +
'                <li><a href="blog.html">Blog</a></li>\n' +
'                <li><a href="about.html">About</a></li>\n' +
'                <li><a href="contact.html">Contact</a></li>\n' +
'            </ul>\n' +
'        </div>\n' +
'    </nav>\n' +
'\n' +
'\n' +
'    <!-- Rendered from the projects array in content.json by script.js -->\n' +
'    <main class="project-detail" data-project="' + escapeHtml(proj.slug) + '">\n' +
'    </main>\n' +
'\n' +
'\n' +
'    <!-- ======== FOOTER ======== -->\n' +
'    <footer>\n' +
'        <p>&copy; 2026 Stoneman Photography. All rights reserved.</p>\n' +
'        <p><a href="copyright.html">Copyright &amp; Image Use</a></p>\n' +
'    </footer>\n' +
'\n' +
'\n' +
'    <script src="js/script.js?v=' + SCRIPT_VERSION + '"></script>\n' +
'\n' +
'</body>\n' +
'</html>\n';
}

/* The <url> entries for published projects, for the managed region of sitemap.xml. */
function projectSitemapRegion(projects) {
    var today = new Date().toISOString().slice(0, 10);
    var entries = (projects || []).filter(function (p) {
        return p.status !== 'draft' && p.slug;
    }).map(function (p) {
        return '  <url>\n' +
               '    <loc>' + projectPageUrl(p.slug) + '</loc>\n' +
               '    <lastmod>' + today + '</lastmod>\n' +
               '    <changefreq>monthly</changefreq>\n' +
               '    <priority>0.7</priority>\n' +
               '  </url>';
    });
    return entries.length ? '\n' + entries.join('\n') + '\n  ' : '\n  ';
}

/* Rewrite the projects region of sitemap.xml, returning an upsert (or nothing
   if it is already correct). Never touches the hand-written entries above it. */
function sitemapUpsert(projects) {
    return ghGetFile('sitemap.xml').then(function (f) {
        var open = '<!-- projects:start -->', close = '<!-- projects:end -->';
        if (f.text.indexOf(open) === -1 || f.text.indexOf(close) === -1) return null;
        var re = new RegExp(open.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&') +
                            '[\\s\\S]*?' + close.replace(/[-[\]{}()*+?.,\\^$|#]/g, '\\$&'));
        var updated = f.text.replace(re, open + projectSitemapRegion(projects) + close);
        if (updated === f.text) return null;
        return { path: 'sitemap.xml', base64: b64EncodeUnicode(updated) };
    }).catch(function () {
        return null;   // a sitemap problem must never block saving a project
    });
}
