/**
 * Global State
 */
// 1. Paste your Web App URL here:
const API_URL = "https://script.google.com/macros/s/AKfycbzW51G-ZPRLvFOgjjzBoavjITXB7Gp9V4cFiTvSUk-G5IB5cZW16yRWqK0CifEZXF_J/exec";

let currentUser = { id: 'worker-001', role: 'worker', siteId: 'site-alpha' }; // Mock auth
let currentGeo = null;
let html5QrcodeScanner = null;

// DOM Elements
const views = document.querySelectorAll('.view');
const navBtns = document.querySelectorAll('.nav-btn');

/**
 * API Helper
 */
async function callApi(action, payload = {}) {
    // Check if URL is still default placeholder
    if (API_URL.includes("YOUR_WEB_APP_URL_HERE")) {
        alert("⚠️ Please update the API_URL in script.js with your Web App URL!");
        throw new Error("API URL not configured");
    }

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify({ action, payload })
        });
        const result = await response.json();
        if (result.error) throw new Error(result.error);
        return result;
    } catch (error) {
        console.error("API Call Failed:", error);
        throw error;
    }
}

/**
 * Navigation
 */
function switchView(viewId) {
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    navBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === viewId);
    });

    if (viewId === 'scan') startScanner();
    else stopScanner();
}

document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.target));
});

/**
 * Geolocation
 */
function updateLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                currentGeo = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                document.getElementById('geo-status').textContent = '📍 Location Locked';
                document.getElementById('geo-status').classList.replace('status-error', 'status-success');
            },
            (err) => {
                console.warn('Geo error', err);
                document.getElementById('geo-status').textContent = '⚠️ Location Missing';
            }
        );
    }
}

/**
 * QR Scanner Logic
 */
function startScanner() {
    if (html5QrcodeScanner) return;

    const checkLib = setInterval(() => {
        if (window.Html5Qrcode) {
            clearInterval(checkLib);
            initScanner();
        }
    }, 100);
}

function initScanner() {
    const html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess)
        .then(() => {
            html5QrcodeScanner = html5QrCode;
        })
        .catch(err => console.error("Error starting scanner", err));
}

function stopScanner() {
    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner.clear();
            html5QrcodeScanner = null;
        }).catch(err => console.error("Failed to stop scanner", err));
    }
}

function onScanSuccess(decodedText, decodedResult) {
    console.log(`Scan result: ${decodedText}`);
    stopScanner();
    document.getElementById('usage-bag-id').value = decodedText;
    switchView('usage');
    playBeep();
}

function playBeep() {
    const audio = new Audio('https://freetestdata.com/wp-content/uploads/2021/09/Free_Test_Data_100KB_MP3.mp3');
    // audio.play().catch(e => console.log(e));
}

/**
 * Forms & Server Actions
 */

// Handle Usage Form
document.getElementById('form-usage').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;
    btn.innerText = 'Processing...';
    btn.disabled = true;

    const bagId = document.getElementById('usage-bag-id').value;
    const fileInput = document.getElementById('usage-photo');

    const processSubmission = async (base64Photo) => {
        const payload = {
            bag_id: bagId,
            worker_id: currentUser.id,
            site_id: currentUser.siteId,
            photo_base64: base64Photo,
            geo: currentGeo
        };

        try {
            const res = await callApi('recordUsage', payload);
            if (res.success) {
                alert("Usage Recorded!");
                e.target.reset();
                switchView('home');
            } else {
                alert("Error: " + res.error);
            }
        } catch (err) {
            alert("System Error: " + err.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    };

    if (fileInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const base64 = e.target.result.split(',')[1];
            processSubmission(base64);
        };
        reader.readAsDataURL(fileInput.files[0]);
    } else {
        processSubmission(null);
    }
});

// Handle Register Form
document.getElementById('form-register').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = 'Registering...';
    btn.disabled = true;

    const plant = document.getElementById('reg-plant').value;
    const batch = document.getElementById('reg-batch').value;
    const count = parseInt(document.getElementById('reg-count').value);

    try {
        const res = await callApi('registerBatch', { plant, batch, count });
        // Old: alert(`Success! Generated ${res.count} bag IDs.`);

        // Render Labels
        const container = document.getElementById('print-container');
        container.innerHTML = ''; // Clear previous

        if (res.ids && res.ids.length > 0) {
            res.ids.forEach(id => {
                const div = document.createElement('div');
                div.className = 'label-item';
                div.innerHTML = `
                    <div class="label-meta">CEMENT TRACKER</div>
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${id}" alt="QR">
                    <div class="label-id">${id}</div>
                `;
                container.appendChild(div);
            });

            switchView('print'); // Show the print view
            alert("Batch Generated! Scroll down to see print labels.");
        } else {
            alert("Batch registered, but no IDs returned? Server sent: " + JSON.stringify(res));
            switchView('home');
        }

        loadDashboard();
    } catch (err) {
        console.error(err);
        alert("Error: " + err.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
});


/**
 * Dashboard Logic
 */
let dashboardChart = null;

function renderChart() {
    const ctx = document.getElementById('efficiencyChart').getContext('2d');
    if (dashboardChart) dashboardChart.destroy();

    dashboardChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
            datasets: [{
                label: 'Production',
                data: [65, 59, 80, 81, 56, 125, 100],
                borderColor: '#f97316',
                backgroundColor: 'rgba(249, 115, 22, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { display: false },
                y: {
                    display: true,
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#94a3b8' }
                }
            }
        }
    });
}

function loadDashboard() {
    callApi('getDashboardStats')
        .then(stats => {
            const elTotal = document.getElementById('stat-total-bags');
            if (elTotal) elTotal.innerText = stats.totalBags;
            renderChart();
        })
        .catch(err => console.error("Dashboard Load Failed", err));
}

// Initial Setup
window.onload = () => {
    updateLocation();
    loadDashboard();
};
