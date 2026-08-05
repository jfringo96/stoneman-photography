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
    branch: 'admin-panel'          // <-- test branch; changes here do NOT go live
};

var API = 'https://api.github.com';
var TOKEN_KEY = 'sp_admin_token';
var THUMB_MAX_EDGE = 1000;         // longest side of generated thumbnails (px)
var THUMB_QUALITY  = 0.82;
var MAX_FEATURED   = 3;            // home page shows 3 featured photos


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

/* Resize a File down to a thumbnail JPEG Blob. */
function makeThumb(file, maxEdge) {
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
                blob ? resolve(blob) : reject(new Error('Could not create thumbnail.'));
            }, 'image/jpeg', THUMB_QUALITY);
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
        img.src = url;
    });
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
        renderPhotos();
    });
}

function renderPhotos() {
    var body = $('panelBody');
    var photos = state.content.portfolio || [];

    var rows = photos.map(function (p) {
        var isFeatured = state.featured.indexOf(p.filename) !== -1;
        return '' +
        '<div class="photo-row" data-filename="' + escapeHtml(p.filename) + '">' +
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
        '<div class="add-form-holder" id="addFormHolder"></div>' +
        '<div class="photo-list" id="photoList">' + rows + '</div>';

    // Drag-to-reorder
    if (typeof Sortable !== 'undefined') {
        Sortable.create($('photoList'), { handle: '.drag', animation: 150 });
    }

    updateFeaturedCount();
    wirePhotoEvents();
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

function wirePhotoEvents() {
    $('addPhotoBtn').addEventListener('click', toggleAddForm);
    $('savePhotosBtn').addEventListener('click', savePhotos);

    document.querySelectorAll('.photo-row').forEach(function (row) {
        var fn = row.getAttribute('data-filename');
        row.querySelector('.up').addEventListener('click', function () { moveRow(row, -1); });
        row.querySelector('.down').addEventListener('click', function () { moveRow(row, 1); });
        row.querySelector('.star').addEventListener('click', function () { toggleFeatured(fn, this); });
        row.querySelector('.remove').addEventListener('click', function () { removePhoto(fn, row); });
    });
}

/* Move a row up (-1) or down (+1) in the list. */
function moveRow(row, dir) {
    var list = row.parentNode;
    if (dir === -1 && row.previousElementSibling) {
        list.insertBefore(row, row.previousElementSibling);
    } else if (dir === 1 && row.nextElementSibling) {
        list.insertBefore(row.nextElementSibling, row);
    }
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
}

function removePhoto(filename, row) {
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
                selectField('afCategory', 'Category', ['wildlife', 'landscape']) +
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
            var which = tab.getAttribute('data-tab');
            if (which === 'photos') {
                if (state.content) renderPhotos();
            } else if (which === 'hero') {
                loadHeroPanel();
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
