/* ==========================================================
   STONEMAN PHOTOGRAPHY — Site Manager (admin tool)

   A self-contained editor for the site. It talks directly to
   GitHub on your behalf: reading content.json to show your
   current photos/blog, and (in later phases) committing changes
   back so the live site updates — all without you touching code.

   THIS FILE IS THE FOUNDATION (Phase 1):
     - Log in with a GitHub token (stored in this browser only)
     - Prove we can reach the repo and read content.json
   Photos / Hero / Blog / Page-text editing build on top of this.
   ========================================================== */


/* ----------------------------------------------------------
   CONFIG
   Which repo and branch this tool reads/writes. While we build
   and test, this points at the SAFE 'admin-panel' branch — the
   live site (master) is never touched. We flip this to 'master'
   only when everything works and you're happy.
   ---------------------------------------------------------- */

var CONFIG = {
    owner:  'jfringo96',
    repo:   'stoneman-photography',
    branch: 'admin-panel'          // <-- test branch; changes here do NOT go live
};

var API = 'https://api.github.com';
var TOKEN_KEY = 'sp_admin_token';   // localStorage key


/* ----------------------------------------------------------
   SMALL HELPERS
   ---------------------------------------------------------- */

function $(id) { return document.getElementById(id); }

function getToken() { return localStorage.getItem(TOKEN_KEY) || ''; }
function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
function clearToken() { localStorage.removeItem(TOKEN_KEY); }

/* Decode a base64 string that may contain UTF-8 (accents, etc.) correctly. */
function b64DecodeUnicode(str) {
    var clean = (str || '').replace(/\n/g, '');
    var bytes = atob(clean);
    var percent = Array.prototype.map.call(bytes, function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join('');
    return decodeURIComponent(percent);
}

/* Show a status message in a given element. type = 'ok' | 'error'. */
function showStatus(el, message, type) {
    el.textContent = message;
    el.className = 'status ' + (type || 'ok');
    el.classList.remove('hidden');
}


/* ----------------------------------------------------------
   GITHUB API
   ---------------------------------------------------------- */

/* Fetch a file from the repo. Returns { json | text, sha } or throws.
   The sha is needed later to update the file (GitHub requires it). */
function ghGetFile(path) {
    var url = API + '/repos/' + CONFIG.owner + '/' + CONFIG.repo +
              '/contents/' + encodeURIComponent(path).replace(/%2F/g, '/') +
              '?ref=' + encodeURIComponent(CONFIG.branch);

    return fetch(url, {
        headers: {
            'Authorization': 'Bearer ' + getToken(),
            'Accept': 'application/vnd.github+json'
        }
    }).then(function (res) {
        if (res.status === 401) throw new Error('Token rejected — it may be wrong or expired.');
        if (res.status === 404) throw new Error('Could not find ' + path + ' on branch "' + CONFIG.branch + '".');
        if (!res.ok) throw new Error('GitHub error (' + res.status + ').');
        return res.json();
    }).then(function (data) {
        return {
            sha:  data.sha,
            text: b64DecodeUnicode(data.content)
        };
    });
}


/* ----------------------------------------------------------
   VIEW SWITCHING
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
   CONNECT / TEST
   Reads content.json to prove the whole pipeline works and to
   give a quick summary. Later phases replace the summary with
   the real editing panels.
   ---------------------------------------------------------- */

function loadAndSummarise() {
    var summary = $('connSummary');
    summary.textContent = 'Reading your site…';

    return ghGetFile('content.json').then(function (file) {
        var content = JSON.parse(file.text);
        var photos = (content.portfolio || []).length;
        var wildlife = (content.portfolio || []).filter(function (p) { return p.category === 'wildlife'; }).length;
        var landscape = (content.portfolio || []).filter(function (p) { return p.category === 'landscape'; }).length;
        var blogs = (content.blog || []).length;

        summary.innerHTML =
            '<div style="text-align:left; max-width:420px; margin:0 auto;">' +
              '<p style="color:var(--ok); font-weight:600; margin-top:0;">✓ Connected successfully.</p>' +
              '<p>Your site currently has:</p>' +
              '<ul>' +
                '<li><strong>' + photos + '</strong> portfolio photos ' +
                    '(' + wildlife + ' wildlife, ' + landscape + ' landscape)</li>' +
                '<li><strong>' + blogs + '</strong> blog posts</li>' +
              '</ul>' +
              '<p class="help">The Photos editor is next to be built. This screen just proves the ' +
              'tool can safely read and (soon) update your site.</p>' +
            '</div>';
    }).catch(function (err) {
        summary.innerHTML = '<p style="color:var(--danger);">' + err.message + '</p>';
    });
}

function connect(token) {
    setToken(token);
    var status = $('loginStatus');
    showStatus(status, 'Checking…', 'ok');

    return ghGetFile('content.json').then(function () {
        status.classList.add('hidden');
        showApp();
        loadAndSummarise();
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

    // Tab switching (panels are placeholders until each phase is built)
    document.querySelectorAll('.tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
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
        clearToken();
        $('tokenInput').value = '';
        showLogin();
    });

    // If a token is already saved from a previous visit, reconnect automatically.
    if (getToken()) {
        showApp();
        loadAndSummarise().catch(function () { showLogin(); });
    } else {
        showLogin();
    }
});
