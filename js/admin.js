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

/* Re-point every photo in oldKey to newKey. */
function migratePhotoCategory(oldKey, newKey) {
    (state.content.portfolio || []).forEach(function (p) {
        if (p.category === oldKey) p.category = newKey;
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
    if (which === 'hero') loadHeroPanel();
    else if (which === 'blog') renderBlogPanel();
    else if (which === 'text') loadTextPanel();
    else if (which === 'categories') renderCategoriesPanel();
    else renderPhotos();
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
        '<div class="photo-list" id="photoList">' + rows + '</div>';

    // Drag-to-reorder
    if (typeof Sortable !== 'undefined') {
        Sortable.create($('photoList'), { handle: '.drag', animation: 150 });
    }

    updateFeaturedCount();
    renderFeaturedStrip();
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
    renderFeaturedStrip();
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
        'button order (the first is shown by default). A category can only be removed once it has no photos in it.</p>';

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
        if (state.content.categories[i] && input) state.content.categories[i].label = input.value;
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

var blogForm = null;   // { index, images: [{kind:'existing',name} | {kind:'new',file,previewUrl}] }

function blogSrc(fn) {
    return 'https://raw.githubusercontent.com/' + CONFIG.owner + '/' + CONFIG.repo +
           '/' + CONFIG.branch + '/images/Blog/' + encodeURIComponent(fn);
}
function blogFlash(msg, type) { var el = $('blogStatus'); if (el) showStatus(el, msg, type); }

function getBlogImageNames() {
    var taken = {};
    (state.content.blog || []).forEach(function (p) {
        (p.images || []).forEach(function (n) { taken[n] = true; });
    });
    return taken;
}

function loadBlogPanel() {
    if (!state.content.blog) state.content.blog = [];
    renderBlogPanel();
}

function renderBlogPanel() {
    var posts = state.content.blog || [];
    var rows = posts.map(function (post, i) {
        var thumb = (post.images && post.images[0])
            ? '<img src="' + blogSrc(post.images[0]) + '" alt="">'
            : '<div class="noimg">No image</div>';
        return '' +
        '<div class="blog-row" data-index="' + i + '">' +
            '<span class="reorder">' +
                '<button class="up" title="Move up">▲</button>' +
                '<button class="down" title="Move down">▼</button>' +
            '</span>' +
            '<div class="blog-thumb">' + thumb + '</div>' +
            '<div class="blog-rowmeta">' +
                '<span class="blog-rowtitle">' + escapeHtml(post.title || '(untitled)') + '</span>' +
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
    var post = (index === null)
        ? { title: '', date: formatDate(new Date()), body: '', images: [] }
        : state.content.blog[index];

    blogForm = {
        index: index,
        images: (post.images || []).map(function (name) { return { kind: 'existing', name: name }; })
    };

    $('postFormHolder').innerHTML =
        '<div class="add-form">' +
            '<div class="af-field"><label for="pfTitle">Title</label>' +
                '<input type="text" id="pfTitle" value="' + escapeHtml(post.title || '') + '"></div>' +
            '<div class="af-field"><label for="pfDate">Date</label>' +
                '<input type="text" id="pfDate" value="' + escapeHtml(post.date || '') + '"></div>' +
            '<div class="af-field"><label for="pfBody">Body (leave a blank line between paragraphs)</label>' +
                '<textarea id="pfBody" rows="7">' + escapeHtml(post.body || '') + '</textarea></div>' +
            '<label class="btn-like">+ Add image(s)' +
                '<input type="file" id="pfImages" accept="image/jpeg,image/png" multiple hidden></label>' +
            '<div class="pf-images" id="pfImagesPreview"></div>' +
            '<div class="af-actions">' +
                '<button id="pfSave">Save post</button>' +
                '<button class="secondary" id="pfCancel">Cancel</button>' +
            '</div>' +
            '<div class="status hidden" id="pfStatus"></div>' +
        '</div>';

    $('pfImages').addEventListener('change', onFormImagesChosen);
    $('pfSave').addEventListener('click', savePost);
    $('pfCancel').addEventListener('click', function () { $('postFormHolder').innerHTML = ''; blogForm = null; });
    renderFormImages();
    $('postFormHolder').scrollIntoView({ block: 'nearest' });
}

function onFormImagesChosen(e) {
    Array.prototype.forEach.call(e.target.files, function (file) {
        blogForm.images.push({ kind: 'new', file: file, previewUrl: URL.createObjectURL(file) });
    });
    e.target.value = '';
    renderFormImages();
}

function renderFormImages() {
    var wrap = $('pfImagesPreview');
    if (!wrap) return;
    wrap.innerHTML = blogForm.images.map(function (img, i) {
        var src = img.kind === 'existing' ? blogSrc(img.name) : img.previewUrl;
        return '<div class="pf-img"><img src="' + src + '" alt="">' +
               '<button class="pf-img-x" data-i="' + i + '" title="Remove image">×</button></div>';
    }).join('');
    wrap.querySelectorAll('.pf-img-x').forEach(function (b) {
        b.addEventListener('click', function () {
            blogForm.images.splice(parseInt(this.getAttribute('data-i'), 10), 1);
            renderFormImages();
        });
    });
}

function savePost() {
    var status = $('pfStatus');
    var title = $('pfTitle').value.trim();
    if (!title) { showStatus(status, 'Please give the post a title.', 'error'); return; }
    var date = $('pfDate').value.trim();
    var body = $('pfBody').value;

    $('pfSave').disabled = true;
    showStatus(status, 'Preparing…', 'ok');

    var taken = getBlogImageNames();
    var upserts = [];
    var finalNames = new Array(blogForm.images.length);
    var chain = Promise.resolve();

    blogForm.images.forEach(function (img, idx) {
        if (img.kind === 'existing') { finalNames[idx] = img.name; return; }
        chain = chain.then(function () {
            var name = uniqueFilename(slugify(title) + '-' + (idx + 1), '.jpg', taken);
            taken[name] = true;
            return resizeToBlob(img.file, BLOG_MAX_EDGE, BLOG_QUALITY)
                .then(fileToBase64)
                .then(function (b64) {
                    upserts.push({ path: 'images/Blog/' + name, base64: b64 });
                    finalNames[idx] = name;
                });
        });
    });

    chain.then(function () {
        showStatus(status, 'Saving…', 'ok');
        if (!state.content.blog) state.content.blog = [];
        var post = { title: title, date: date, body: body, images: finalNames };
        if (blogForm.index === null) state.content.blog.unshift(post);
        else state.content.blog[blogForm.index] = post;
        upserts.push({ path: 'content.json', base64: contentToBase64(state.content) });
        return commitChanges({
            message: (blogForm.index === null ? 'Add' : 'Update') + ' blog post "' + title + '" via Site Manager',
            upserts: upserts
        });
    }).then(function () {
        blogForm = null;
        return loadContent();
    }).then(function () {
        blogFlash('✓ Saved. The site will update within about a minute.', 'ok');
    }).catch(function (err) {
        showStatus(status, 'Could not save: ' + err.message, 'error');
        if ($('pfSave')) $('pfSave').disabled = false;
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
    var deletes = (post.images || []).map(function (n) { return 'images/Blog/' + n; });
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
      help: 'The Contact link below this text is kept automatically.' }
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
