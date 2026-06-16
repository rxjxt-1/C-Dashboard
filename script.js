let currentMaxSpeedDL = 100, currentMaxSpeedUL = 100;
let scalePointsDL = [], scalePointsUL = [];
let currentDisplayDL = 0, currentDisplayUL = 0;
let selectedServerId = "";

function applyTheme(theme) {
    document.body.className = `theme-${theme}`;
    if(chartInstance) {
        let isLight = (theme === 'white');
        
        setTimeout(() => {
            let lineColor1 = getComputedStyle(document.body).getPropertyValue('--accent-1').trim() || '#4ae0e0';
            let lineColor2 = getComputedStyle(document.body).getPropertyValue('--accent-2').trim() || '#0b84d4';
            
            Chart.defaults.color = isLight ? '#000' : 'rgba(255,255,255,0.5)';
            chartInstance.data.datasets[0].borderColor = lineColor1;
            chartInstance.data.datasets[1].borderColor = lineColor2;
            chartInstance.update();
        }, 50);
    }
}

function openCreator() { window.pywebview.api.open_creator_link(); }

function generateScale(maxSpeed) {
    let points = [];
    let steps = [0, 0.01, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1]; 
    let angles = [0, 30, 60, 90, 120, 150, 180, 210, 240];
    for(let i=0; i<steps.length; i++) {
        let val = Math.round(maxSpeed * steps[i]);
        if(maxSpeed > 100 && val < 1) val = 1; 
        points.push({ val: val, ang: angles[i] });
    }
    return points;
}

function drawScaleTicks(type, maxSpeed) {
    const svg = document.getElementById(`${type}_svg`);
    if (!svg) return;
    let oldTicks = svg.querySelectorAll('.tick-element');
    oldTicks.forEach(e => e.remove());

    let scale = generateScale(maxSpeed);
    if(type === 'dl') scalePointsDL = scale;
    if(type === 'ul') scalePointsUL = scale;
    
    scale.forEach((point) => {
        let angle = point.ang - 120; 
        let rad = angle * (Math.PI / 180);
        let outX = 100 + 74 * Math.sin(rad); let outY = 100 - 74 * Math.cos(rad);
        let inX = 100 + 66 * Math.sin(rad); let inY = 100 - 66 * Math.cos(rad);
        
        let line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", outX); line.setAttribute("y1", outY);
        line.setAttribute("x2", inX); line.setAttribute("y2", inY);
        line.setAttribute("stroke", "var(--border-color)"); line.setAttribute("stroke-width", "3");
        line.setAttribute("stroke-linecap", "round"); line.classList.add("tick-element");
        svg.appendChild(line);

        let txtX = 100 + 46 * Math.sin(rad); let txtY = 100 - 46 * Math.cos(rad);
        let text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", txtX); text.setAttribute("y", txtY + 4); 
        text.setAttribute("fill", "var(--text-main)"); text.setAttribute("font-size", maxSpeed > 100 ? "9" : "10"); 
        text.setAttribute("font-weight", "600"); text.setAttribute("text-anchor", "middle");
        text.textContent = point.val; text.classList.add("tick-element");
        svg.appendChild(text);
    });
    
    let needleGrp = document.getElementById(`${type}_needle_group`);
    let hubIcon = document.getElementById(`${type}_center_icon`);
    if(needleGrp) svg.appendChild(needleGrp);
    if(hubIcon) svg.appendChild(hubIcon); 
}

function calculateAngle(speed, scalePoints) {
    if (scalePoints.length === 0) return 0;
    let max = scalePoints[scalePoints.length-1].val;
    if (speed >= max) return 240;
    if (speed <= 0) return 0;
    for (let i = 0; i < scalePoints.length - 1; i++) {
        let p1 = scalePoints[i]; let p2 = scalePoints[i+1];
        if (speed >= p1.val && speed <= p2.val) {
            let rangeVal = p2.val - p1.val; let rangeAng = p2.ang - p1.ang;
            let pct = (speed - p1.val) / rangeVal; return p1.ang + (pct * rangeAng);
        }
    }
    return 0;
}

let dlHistory = []; let ulHistory = [];
const HISTORY_SIZE = 2;
let chartInstance, chartLabels = Array(60).fill(""), chartDataDL = Array(60).fill(0), chartDataUL = Array(60).fill(0);
let statsChartInstance;

function initChart() {
    const ctx = document.getElementById('speedChart').getContext('2d');
    if (!ctx) return;
    
    Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    
    chartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels: chartLabels, datasets: [
            { label: 'Download', data: chartDataDL, borderColor: '#4ae0e0', borderWidth: 2, pointRadius: 0, tension: 0.4 },
            { label: 'Upload', data: chartDataUL, borderColor: '#0b84d4', borderWidth: 2, pointRadius: 0, tension: 0.4 }
        ]},
        options: { 
            responsive: true, maintainAspectRatio: false, animation: false, 
            scales: { y: { beginAtZero: true, display: false }, x: { display: false } }, 
            plugins: { legend: { display: false } } 
        }
    });
}

function toggleLine(datasetIndex, elementId) {
    if (!chartInstance) return;
    const meta = chartInstance.getDatasetMeta(datasetIndex);
    meta.hidden = meta.hidden === null ? !chartInstance.data.datasets[datasetIndex].hidden : null;
    chartInstance.update();
    document.getElementById(elementId).classList.toggle('hidden-line', meta.hidden);
}

function toggleServerDropdown(event) { 
    if(event) event.stopPropagation(); 
    document.getElementById('server_options_list').classList.toggle('open'); 
}

function selectServer(id, name) {
    selectedServerId = id;
    document.getElementById('selected_server_text').innerText = name;
    document.getElementById('server_options_list').classList.remove('open');
}

function populate_servers(servers) {
    let list = document.getElementById('server_options_list');
    list.innerHTML = `<div class="custom-option" onclick="selectServer('', 'Auto: Best Available Server')">Auto: Best Available Server</div>`;
    
    if(!servers || servers.length === 0) {
        list.innerHTML += `<div class="custom-option" style="color: #ff4757;">No servers found. Check internet.</div>`;
    } else {
        servers.forEach(s => { list.innerHTML += `<div class="custom-option" onclick="selectServer('${s.id}', '${s.name}')">${s.name}</div>`; });
    }
}

document.addEventListener('click', function(e) {
    let wrapper = document.getElementById('server_select_wrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        let list = document.getElementById('server_options_list');
        if(list) list.classList.remove('open');
    }
});

window.addEventListener('pywebviewready', async function() {
    let sets = await window.pywebview.api.get_settings();
    applyTheme(sets.theme);
    document.getElementById('themeSelect').value = sets.theme;
    document.getElementById('startupSelect').value = sets.run_on_startup ? "true" : "false";
    document.getElementById('planLimitInput').value = sets.plan_limit_gb;
    document.getElementById('mResetInput').value = sets.monthly_reset_day;
    document.getElementById('dResetInput').value = sets.daily_reset_time;

    drawScaleTicks('dl', currentMaxSpeedDL); drawScaleTicks('ul', currentMaxSpeedUL); initChart();
    
    let info = await window.pywebview.api.get_system_info();
    document.getElementById('sys_hostname').innerText = info.hostname; 
    document.getElementById('sys_ip').innerText = info.ip;
    document.getElementById('sys_conn').innerText = info.conn; 
    
    window.pywebview.api.fetch_servers();
    
    updateDashboardLoop(); 
});

function checkAndRescale(speed, currentMax, type) {
    let newMax = currentMax;
    if (speed > currentMax * 0.9) {
        if (currentMax === 100) newMax = 500; else if (currentMax === 500) newMax = 1000; else if (currentMax === 1000) newMax = 2500;
    }
    if (newMax !== currentMax) { drawScaleTicks(type, newMax); return newMax; }
    return currentMax;
}

function animateValue(elementId, start, end, duration) {
    let startTimestamp = null; const element = document.getElementById(elementId);
    if(!element) return;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        element.innerHTML = (start + progress * (end - start)).toFixed(1);
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}

async function updateDashboardLoop() {
    try {
        let data = await window.pywebview.api.get_all_data();
        
        if (data.outage) document.getElementById('outage_banner').style.display = 'block';
        else document.getElementById('outage_banner').style.display = 'none';

        document.getElementById('boot_dl').innerText = data.boot_dl; document.getElementById('boot_ul').innerText = data.boot_ul;
        document.getElementById('used_data_val').innerText = data.used; document.getElementById('remaining_data_val').innerText = data.remaining;
        document.getElementById('data_progress_bar').style.width = data.usage_percent + "%"; document.getElementById('plan_limit_display').innerText = `(${data.plan_limit}GB)`;

        document.getElementById('graph_dl_kbps').innerText = `${data.live_dl_kbps.toFixed(0)} KB/s ↓`;
        document.getElementById('graph_ul_kbps').innerText = `${data.live_ul_kbps.toFixed(0)} KB/s ↑`;

        let currentDl = data.live_dl_raw_mbps; dlHistory.push(currentDl); if (dlHistory.length > HISTORY_SIZE) dlHistory.shift();
        let avgDl = dlHistory.reduce((a, b) => a + b, 0) / dlHistory.length; if (currentDl === 0) { avgDl = 0; dlHistory = [0, 0]; }
        
        let currentUl = data.live_ul_raw_mbps; ulHistory.push(currentUl); if (ulHistory.length > HISTORY_SIZE) ulHistory.shift();
        let avgUl = ulHistory.reduce((a, b) => a + b, 0) / ulHistory.length; if (currentUl === 0) { avgUl = 0; ulHistory = [0, 0]; }

        currentMaxSpeedDL = checkAndRescale(avgDl, currentMaxSpeedDL, 'dl'); currentMaxSpeedUL = checkAndRescale(avgUl, currentMaxSpeedUL, 'ul');

        let dlAngle = calculateAngle(avgDl, scalePointsDL); document.getElementById('dl_arc').style.strokeDashoffset = 335.1 - (335.1 * (dlAngle / 240));
        document.getElementById('dl_needle_group').style.transform = `rotate(${dlAngle - 120}deg)`; animateValue('dl_speed_big', currentDisplayDL, avgDl, 400); currentDisplayDL = avgDl;

        let ulAngle = calculateAngle(avgUl, scalePointsUL); document.getElementById('ul_arc').style.strokeDashoffset = 335.1 - (335.1 * (ulAngle / 240));
        document.getElementById('ul_needle_group').style.transform = `rotate(${ulAngle - 120}deg)`; animateValue('ul_speed_big', currentDisplayUL, avgUl, 400); currentDisplayUL = avgUl;

        chartDataDL.push(avgDl); chartDataDL.shift(); chartDataUL.push(avgUl); chartDataUL.shift(); chartInstance.update();
    } catch (e) {}
    
    setTimeout(updateDashboardLoop, 1000); 
}

// Modals
function openSettings() { 
    document.getElementById('usedDataInput').value = parseFloat(document.getElementById('used_data_val').innerText) || 0;
    document.getElementById('settingsModal').style.display = 'block'; 
}
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function openDevModal() { document.getElementById('devModal').style.display = 'block'; }

function showCloseModal() { document.getElementById('closeModal').style.display = 'block'; }
function hideCloseModal() { document.getElementById('closeModal').style.display = 'none'; }
function minimizeApp() { window.pywebview.api.minimize_app(); hideCloseModal(); }
function forceCloseApp() { window.pywebview.api.confirm_close(); }

function checkForUpdates() {
    let btn = document.getElementById('updateBtn');
    btn.innerText = "Checking...";
    btn.onclick = checkForUpdates; // Reset click handler safely
    window.pywebview.api.check_for_updates();
}

function update_check_result(msg, download_url) {
    let btn = document.getElementById('updateBtn');
    document.getElementById('updateStatusText').innerText = msg;
    
    if (download_url && download_url !== "") {
        // Agar naya update mila toh button glow karega
        btn.innerText = "Download Update";
        btn.style.background = "rgba(74, 224, 224, 0.2)";
        btn.style.color = "var(--accent-1)";
        btn.style.borderColor = "var(--accent-1)";
        // Click karne par seedha tera browser me GitHub khulega naye setup ke sath
        btn.onclick = function() { window.pywebview.api.open_url(download_url); };
    } else {
        // Normal reset
        btn.innerText = "Check for Updates";
        btn.style.background = "";
        btn.style.color = "";
        btn.style.borderColor = "";
    }
}

async function saveSettings() { 
    let limit = document.getElementById('planLimitInput').value; 
    let used = document.getElementById('usedDataInput').value;
    let theme = document.getElementById('themeSelect').value;
    let startup = document.getElementById('startupSelect').value === "true";
    let mReset = document.getElementById('mResetInput').value;
    let dReset = document.getElementById('dResetInput').value;

    if (used === "") used = null;
    
    applyTheme(theme);
    await window.pywebview.api.save_all_settings(limit, used, theme, startup, mReset, dReset); 
    closeModal('settingsModal'); 
}

async function openStats() {
    let stats = await window.pywebview.api.get_stats();
    let labels = Object.keys(stats).slice(-7); 
    let data = Object.values(stats).slice(-7);

    document.getElementById('statsModal').style.display = 'block';
    
    if(statsChartInstance) statsChartInstance.destroy();
    
    let accentColor = getComputedStyle(document.body).getPropertyValue('--accent-1').trim() || '#4ae0e0';
    
    statsChartInstance = new Chart(document.getElementById('statsChart').getContext('2d'), {
        type: 'bar',
        data: { labels: labels, datasets: [{ label: 'GB Used', data: data, backgroundColor: accentColor, borderRadius: 4 }] },
        options: { 
            responsive: true, maintainAspectRatio: false, 
            plugins: { legend: { display: false } }, 
            scales: { 
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            } 
        }
    });
}

async function openHistory() {
    let hist = await window.pywebview.api.get_speed_history();
    let container = document.getElementById('historyList');
    container.innerHTML = "";
    if(hist.length === 0) { 
        container.innerHTML = "<p style='text-align:center; color:var(--text-muted);'>No history found</p>"; 
    }
    hist.forEach(h => {
        container.innerHTML += `
            <div class="hist-item">
                <div><span class="date">${h.date}</span></div>
                <div class="hist-stats">
                    <span style="color:var(--accent-1); font-weight: bold;">↓ ${h.dl} Mbps</span>
                    <span style="color:var(--accent-2); font-weight: bold;">↑ ${h.ul} Mbps</span>
                    <span style="color:#5ff5a9; font-weight: bold;">⟳ ${h.ping} ms</span>
                </div>
            </div>`;
    });
    document.getElementById('historyModal').style.display = 'block';
}

function run_speed_test() {
    let btn = document.getElementById('speed_test_btn'); 
    let statusText = document.getElementById('speed_status_text');
    
    // Reset any previous error states
    btn.style.background = ""; btn.style.borderColor = ""; btn.style.color = "";
    statusText.style.color = "rgba(255,255,255,0.6)";
    
    btn.disabled = true; btn.innerText = "Running..."; statusText.innerText = "Initializing diagnostic...";
    document.getElementById('download_speed_val').innerText = "--"; 
    document.getElementById('upload_speed_val').innerText = "--"; 
    document.getElementById('ping_val').innerText = "-- ms"; 
    document.getElementById('server_val').innerText = "--";
    
    window.pywebview.api.run_speed_test_python(selectedServerId);
}

// Called directly by Python if SSL or connection fails
function show_error_state(msg) {
    let statusText = document.getElementById('speed_status_text');
    let btn = document.getElementById('speed_test_btn');
    
    statusText.innerText = msg;
    statusText.style.color = '#ff4757';
    
    btn.disabled = false;
    btn.innerText = "↻ Try Again";
    btn.style.background = "rgba(255, 71, 87, 0.15)";
    btn.style.borderColor = "rgba(255, 71, 87, 0.3)";
    btn.style.color = "#ff4757";
}

function update_speed_status(status) { document.getElementById('speed_status_text').innerText = status; }

function update_speed_results(download, upload, ping, server) {
    let btn = document.getElementById('speed_test_btn'); let statusText = document.getElementById('speed_status_text');
    
    // Reset to normal state
    btn.style.background = ""; btn.style.borderColor = ""; btn.style.color = "";
    statusText.style.color = "rgba(255,255,255,0.6)";
    
    btn.disabled = false; btn.innerText = "Start Test"; statusText.innerText = "Diagnostics Complete.";
    document.getElementById('download_speed_val').innerText = download + " Mbps"; document.getElementById('upload_speed_val').innerText = upload + " Mbps"; document.getElementById('ping_val').innerText = ping + " ms"; document.getElementById('server_val').innerText = server;
    
    showQualityAnalysis(parseFloat(download), parseFloat(upload), parseFloat(ping));
}

function showQualityAnalysis(dl, ul, ping) {
    let scores = {
        browsing: dl > 15 ? 5 : (dl > 8 ? 4 : (dl > 3 ? 3 : (dl > 1 ? 2 : 1))),
        gaming: (ping < 20 && dl > 10) ? 5 : ((ping < 45 && dl > 5) ? 4 : ((ping < 80) ? 3 : ((ping < 120) ? 2 : 1))),
        streaming: dl > 80 ? 5 : (dl > 40 ? 4 : (dl > 15 ? 3 : (dl > 5 ? 2 : 1))),
        video: (dl > 20 && ul > 10 && ping < 40) ? 5 : ((dl > 10 && ul > 5 && ping < 80) ? 4 : ((dl > 5 && ul > 2 && ping < 120) ? 3 : ((dl > 2 && ul > 1) ? 2 : 1)))
    };

    function renderDots(score) {
        let html = '';
        for(let i=1; i<=5; i++) {
            if(score === 5) html += '<div class="dot green"></div>';
            else if(score >= 3 && i <= score) html += '<div class="dot white"></div>';
            else if(score <= 2 && i <= score) html += '<div class="dot red"></div>';
            else html += '<div class="dot gray"></div>';
        }
        return html;
    }

    document.getElementById('q_dots_browsing').innerHTML = renderDots(scores.browsing);
    document.getElementById('q_dots_gaming').innerHTML = renderDots(scores.gaming);
    document.getElementById('q_dots_streaming').innerHTML = renderDots(scores.streaming);
    document.getElementById('q_dots_video').innerHTML = renderDots(scores.video);

    document.getElementById('qualityModal').style.display = 'block';
}