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
var SCRIPT_VERSION = 11;           // script.js?v=N used by generated project pages —
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
    else if (which === 'projects') renderProjectsPanel();
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

function getBlockImageNames() {
    var taken = {};
    function addSrc(src) {
        if (!src) return;
        var dirs = Object.keys(BLOCK_IMAGE_DIRS).map(function (k) { return BLOCK_IMAGE_DIRS[k]; });
        for (var i = 0; i < dirs.length; i++) {
            if (src.indexOf(dirs[i]) === 0) { taken[src.slice(dirs[i].length)] = true; return; }
        }
    }
    ['blog', 'projects'].forEach(function (key) {
        (state.content[key] || []).forEach(function (item) {
            (item.images || []).forEach(function (n) { taken[n] = true; });   // legacy blog posts
            (item.blocks || []).forEach(function (b) { addSrc(b.src); });
        });
    });
    return taken;
}

function loadBlogPanel() {
    if (!state.content.blog) state.content.blog = [];
    renderBlogPanel();
}

function firstPostImage(post) {
    if (post.blocks) {
        for (var i = 0; i < post.blocks.length; i++) {
            if (post.blocks[i].type === 'image' && post.blocks[i].filename) return post.blocks[i].filename;
        }
    }
    return (post.images && post.images[0]) || null;
}

function renderBlogPanel() {
    var posts = state.content.blog || [];
    var rows = posts.map(function (post, i) {
        var first = firstPostImage(post);
        var thumb = first ? '<img src="' + blogSrc(first) + '" alt="">' : '<div class="noimg">No image</div>';
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

/* Build the editable block list for a post (converts old body/images posts too). */
function postToEditBlocks(post) {
    var src = post.blocks ? post.blocks : (function () {
        var b = [];
        (post.images || []).forEach(function (fn) { b.push({ type: 'image', filename: fn, size: 'full', align: 'full' }); });
        if (post.body) b.push({ type: 'text', text: post.body });
        return b;
    })();
    return src.map(function (b) {
        if (b.type === 'image') {
            return { type: 'image', src: b.src || (b.filename ? 'images/Blog/' + b.filename : ''), size: b.size || 'medium', align: b.align || 'center' };
        }
        return { type: 'text', text: b.text || '' };
    });
}

function openPostForm(index) {
    var post = (index === null) ? { title: '', date: formatDate(new Date()), blocks: [] } : state.content.blog[index];
    editForm = { kind: 'blog', index: index, blocks: postToEditBlocks(post) };

    $('postFormHolder').innerHTML =
        '<div class="add-form">' +
            '<div class="af-field"><label for="pfTitle">Title</label>' +
                '<input type="text" id="pfTitle" value="' + escapeHtml(post.title || '') + '"></div>' +
            '<div class="af-field"><label for="pfDate">Date</label>' +
                '<input type="text" id="pfDate" value="' + escapeHtml(post.date || '') + '"></div>' +
            '<div class="blocks-holder" id="blocksHolder"></div>' +
            '<div class="block-add">' +
                '<button class="secondary" id="addTextBlock">+ Add text</button>' +
                '<label class="btn-like">+ Upload image' +
                    '<input type="file" id="addImageBlock" accept="image/jpeg,image/png" multiple hidden></label>' +
                '<button class="secondary" id="addLibImage">+ From library</button>' +
            '</div>' +
            '<div class="library-picker hidden" id="libraryPicker"></div>' +
            '<div class="af-actions">' +
                '<button id="pfSave">Save post</button>' +
                '<button class="secondary" id="pfCancel">Cancel</button>' +
            '</div>' +
            '<div class="status hidden" id="pfStatus"></div>' +
        '</div>';

    $('addTextBlock').addEventListener('click', function () {
        syncBlockInputs(); editForm.blocks.push({ type: 'text', text: '' }); renderBlocks();
    });
    $('addImageBlock').addEventListener('change', onBlockImageChosen);
    $('addLibImage').addEventListener('click', function () { openLibraryPicker(); });
    $('pfSave').addEventListener('click', savePost);
    $('pfCancel').addEventListener('click', function () { $('postFormHolder').innerHTML = ''; editForm = null; });
    renderBlocks();
    $('postFormHolder').scrollIntoView({ block: 'nearest' });
}

function blkSelect(cls, options, sel) {
    return '<select class="' + cls + '">' + options.map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === sel ? ' selected' : '') + '>' + o[1] + '</option>';
    }).join('') + '</select>';
}

function renderBlocks() {
    var holder = $('blocksHolder');
    if (!holder) return;
    if (!editForm.blocks.length) {
        holder.innerHTML = '<p class="help">Add text and image blocks below — their top-to-bottom order is the order on the page.</p>';
        return;
    }
    holder.innerHTML = editForm.blocks.map(function (b, i) {
        var ctrl = '<div class="blk-ctrl">' +
            '<button class="blk-up" data-i="' + i + '" title="Move up"' + (i === 0 ? ' disabled' : '') + '>▲</button>' +
            '<button class="blk-down" data-i="' + i + '" title="Move down"' + (i === editForm.blocks.length - 1 ? ' disabled' : '') + '>▼</button>' +
            '<button class="blk-del" data-i="' + i + '" title="Remove block">✕</button>' +
        '</div>';
        if (b.type === 'text') {
            return '<div class="blk" data-i="' + i + '"><div class="blk-tag">Text</div>' +
                '<textarea class="blk-text" rows="4" placeholder="Write a paragraph… (blank line = new paragraph)">' + escapeHtml(b.text || '') + '</textarea>' +
                ctrl + '</div>';
        }
        var src = b.file ? b.previewUrl : rawSrc(b.src);
        return '<div class="blk" data-i="' + i + '"><div class="blk-tag">Image</div>' +
            '<div class="blk-imgrow">' +
                '<img class="blk-thumb" src="' + src + '" alt="">' +
                '<div class="blk-opts">' +
                    '<label>Size ' + blkSelect('blk-size', [['small','Small'],['medium','Medium'],['large','Large'],['full','Full width']], b.size) + '</label>' +
                    '<label>Position ' + blkSelect('blk-align', [['left','Left (wrap)'],['center','Centre'],['right','Right (wrap)']], b.align) + '</label>' +
                '</div>' +
            '</div>' +
            ctrl + '</div>';
    }).join('');

    holder.querySelectorAll('.blk-up').forEach(function (bt) {
        bt.addEventListener('click', function () { syncBlockInputs(); moveBlock(parseInt(this.getAttribute('data-i'), 10), -1); });
    });
    holder.querySelectorAll('.blk-down').forEach(function (bt) {
        bt.addEventListener('click', function () { syncBlockInputs(); moveBlock(parseInt(this.getAttribute('data-i'), 10), 1); });
    });
    holder.querySelectorAll('.blk-del').forEach(function (bt) {
        bt.addEventListener('click', function () {
            syncBlockInputs();
            editForm.blocks.splice(parseInt(this.getAttribute('data-i'), 10), 1);
            renderBlocks();
        });
    });
}

/* Read the on-screen block inputs back into state before any re-render. */
function syncBlockInputs() {
    document.querySelectorAll('#blocksHolder .blk').forEach(function (el) {
        var i = parseInt(el.getAttribute('data-i'), 10);
        var b = editForm.blocks[i];
        if (!b) return;
        if (b.type === 'text') {
            var ta = el.querySelector('.blk-text');
            if (ta) b.text = ta.value;
        } else {
            var s = el.querySelector('.blk-size'), a = el.querySelector('.blk-align');
            if (s) b.size = s.value;
            if (a) b.align = a.value;
        }
    });
}

function moveBlock(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= editForm.blocks.length) return;
    var t = editForm.blocks[i]; editForm.blocks[i] = editForm.blocks[j]; editForm.blocks[j] = t;
    renderBlocks();
}

function onBlockImageChosen(e) {
    syncBlockInputs();
    Array.prototype.forEach.call(e.target.files, function (file) {
        editForm.blocks.push({ type: 'image', file: file, previewUrl: URL.createObjectURL(file), size: 'medium', align: 'center' });
    });
    e.target.value = '';
    renderBlocks();
}

/* Picker to reuse an existing photo (no new copy is stored).
   With no argument it appends an image block; given onPick it calls that with
   the chosen photo instead (used to set a project cover). `extras` adds images
   that aren't in the portfolio - a project's own uploads, for its cover. Each
   item hands back either a bare portfolio filename or a full repo path, both of
   which projCoverSrc and the site's projectImageSrc already understand. */
function openLibraryPicker(onPick, extras) {
    if (!onPick) syncBlockInputs();
    var holder = $('libraryPicker');
    var extraItems = (extras || []).map(function (e) {
        return '<button class="lib-item" data-fn="' + escapeHtml(e.value) + '">' +
               '<img src="' + rawSrc(e.value) + '" alt="" loading="lazy">' +
               '<span>' + escapeHtml(e.label) + '</span></button>';
    }).join('');
    holder.innerHTML =
        '<div class="lib-head"><span>Choose an existing photo to reuse</span>' +
            '<button class="link" id="libClose">Close</button></div>' +
        (extraItems ? '<div class="lib-sub">From this project</div><div class="lib-grid">' + extraItems + '</div>' +
                      '<div class="lib-sub">From the portfolio</div>' : '') +
        '<div class="lib-grid">' +
            (state.content.portfolio || []).map(function (p) {
                return '<button class="lib-item" data-fn="' + escapeHtml(p.filename) + '">' +
                       '<img src="' + imgSrc(p.filename) + '" alt="" loading="lazy">' +
                       '<span>' + escapeHtml(p.title) + '</span></button>';
            }).join('') +
        '</div>';
    holder.classList.remove('hidden');
    $('libClose').addEventListener('click', function () { holder.classList.add('hidden'); holder.innerHTML = ''; });
    holder.querySelectorAll('.lib-item').forEach(function (bt) {
        bt.addEventListener('click', function () {
            var fn = this.getAttribute('data-fn');
            holder.classList.add('hidden'); holder.innerHTML = '';
            if (onPick) { onPick(fn); return; }
            editForm.blocks.push({ type: 'image', src: 'images/Thumb/' + fn, size: 'medium', align: 'center' });
            renderBlocks();
        });
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

    var taken = getBlockImageNames();
    var upserts = [];
    var chain = Promise.resolve();

    editForm.blocks.forEach(function (b, idx) {
        if (b.type === 'image' && b.file) {
            chain = chain.then(function () {
                var name = uniqueFilename(slugify(title) + '-' + (idx + 1), '.jpg', taken);
                taken[name] = true;
                return resizeToBlob(b.file, BLOG_MAX_EDGE, BLOG_QUALITY)
                    .then(fileToBase64)
                    .then(function (b64) {
                        upserts.push({ path: blockImageDir() + name, base64: b64 });
                        b._finalSrc = blockImageDir() + name;
                    });
            });
        }
    });

    chain.then(function () {
        showStatus(status, 'Saving…', 'ok');
        var blocks = editForm.blocks.map(function (b) {
            if (b.type === 'text') return { type: 'text', text: b.text || '' };
            return { type: 'image', src: (b.file ? b._finalSrc : b.src), size: b.size || 'medium', align: b.align || 'center' };
        }).filter(function (b) {
            return b.type === 'text' ? (b.text || '').trim() : b.src;
        });

        if (!state.content.blog) state.content.blog = [];
        var post = { title: title, date: date, blocks: blocks };
        if (editForm.index === null) state.content.blog.unshift(post);
        else state.content.blog[editForm.index] = post;
        upserts.push({ path: 'content.json', base64: contentToBase64(state.content) });
        return commitChanges({
            message: (editForm.index === null ? 'Add' : 'Update') + ' blog post "' + title + '" via Site Manager',
            upserts: upserts
        });
    }).then(function () {
        editForm = null;
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
    editForm = { kind: 'project', index: index, blocks: postToEditBlocks(proj), cover: proj.cover || '' };

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
            '<div class="blocks-holder" id="blocksHolder"></div>' +
            '<div class="block-add">' +
                '<button class="secondary" id="addTextBlock">+ Add text</button>' +
                '<label class="btn-like">+ Upload image' +
                    '<input type="file" id="addImageBlock" accept="image/jpeg,image/png" multiple hidden></label>' +
                '<button class="secondary" id="addLibImage">+ From library</button>' +
            '</div>' +
            '<div class="library-picker hidden" id="libraryPicker"></div>' +
            '<div class="af-actions">' +
                '<button id="prSave">Save project</button>' +
                '<button class="secondary" id="prPreview">Preview</button>' +
                '<button class="secondary" id="prCancel">Cancel</button>' +
            '</div>' +
            '<div class="status hidden" id="prFormStatus"></div>' +
        '</div>';

    $('addTextBlock').addEventListener('click', function () {
        syncBlockInputs(); editForm.blocks.push({ type: 'text', text: '' }); renderBlocks();
    });
    $('addImageBlock').addEventListener('change', onBlockImageChosen);
    $('addLibImage').addEventListener('click', function () { openLibraryPicker(); });
    $('prSave').addEventListener('click', saveProject);
    $('prPreview').addEventListener('click', previewProject);
    $('prCancel').addEventListener('click', function () { $('projFormHolder').innerHTML = ''; editForm = null; });
    renderProjectCover();
    renderBlocks();
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

    var taken = getBlockImageNames();
    var upserts = [];
    var chain = Promise.resolve();

    editForm.blocks.forEach(function (b, idx) {
        if (b.type === 'image' && b.file) {
            chain = chain.then(function () {
                var name = uniqueFilename(slug + '-' + (idx + 1), '.jpg', taken);
                taken[name] = true;
                return resizeToBlob(b.file, BLOG_MAX_EDGE, BLOG_QUALITY)
                    .then(fileToBase64)
                    .then(function (b64) {
                        upserts.push({ path: blockImageDir() + name, base64: b64 });
                        b._finalSrc = blockImageDir() + name;
                    });
            });
        }
    });

    chain.then(function () {
        showStatus(status, 'Saving…', 'ok');
        var blocks = editForm.blocks.map(function (b) {
            if (b.type === 'text') return { type: 'text', text: b.text || '' };
            return { type: 'image', src: (b.file ? b._finalSrc : b.src), size: b.size || 'medium', align: b.align || 'center' };
        }).filter(function (b) {
            return b.type === 'text' ? (b.text || '').trim() : b.src;
        });

        if (!state.content.projects) state.content.projects = [];
        var proj = {
            slug: slug,
            title: title,
            subtitle: $('prSubtitle').value.trim(),
            cover: editForm.cover || '',
            status: $('prVisibility').value === 'published' ? 'published' : 'draft',
            blocks: blocks
        };
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
        editForm = null;
        return loadContent();
    }).then(function () {
        projFlash('✓ Saved. The site will update within about a minute.', 'ok');
    }).catch(function (err) {
        showStatus(status, 'Could not save: ' + err.message, 'error');
        if ($('prSave')) $('prSave').disabled = false;
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
'    <link rel="stylesheet" href="css/style.css">\n' +
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
