const TEST_TYPES = [
    { id: "freins", name: "Test des freins" },
    { id: "parallelisme", name: "Parallélisme" },
    { id: "eclairage", name: "Éclairage" },
    { id: "pollution", name: "Contrôle pollution" },
    { id: "vidange", name: "Vidange" }
];

// Credentials par défaut
const VALID_CREDENTIALS = {
    "admin": "admin123",
    "ludo": "ludo17"
};

let state = {
    waitingClients: [
        {
            id: "VT-01",
            status: "pending",
            startTime: null,
            endTime: null,
            tests: TEST_TYPES.map(test => ({
                id: test.id,
                name: test.name,
                status: "pending",
                notes: ""
            }))
        },
        {
            id: "VT-02",
            status: "pending",
            startTime: null,
            endTime: null,
            tests: TEST_TYPES.map(test => ({
                id: test.id,
                name: test.name,
                status: "pending",
                notes: ""
            }))
        }
    ],
    currentClient: null,
    history: [],
    loggedInUser: null,
    currentReport: null
};

// Initialisation
document.addEventListener("DOMContentLoaded", function() {
    // Login form handler
    document.getElementById("login-form").addEventListener("submit", function(e) {
        e.preventDefault();
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        
        if (login(username, password)) {
            // Successfully logged in
        } else {
            alert("Identifiants incorrects");
        }
    });

    // Logout button
    document.getElementById("logout-btn").addEventListener("click", logout);

    // Call next client button
    document.getElementById("call-next-btn").addEventListener("click", callNextClient);

    // Reports functionality
    document.getElementById("generate-report-btn").addEventListener("click", generateReport);
    document.getElementById("download-report-btn").addEventListener("click", downloadReportExcel);
    document.getElementById("download-pdf-btn").addEventListener("click", downloadReportPDF);

    // History detail overlay
    document.getElementById("history-detail-close-btn").addEventListener("click", hideHistoryDetail);
    document.getElementById("history-detail-overlay").addEventListener("click", function(e) {
        if (e.target === this) {
            hideHistoryDetail();
        }
    });

    // Add technician form
    document.getElementById("add-technician-form").addEventListener("submit", function(e) {
        e.preventDefault();
        addTechnician();
    });

    // Load existing technicians
    loadTechnicians();
});

function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });
    const dateString = now.toLocaleDateString("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
    });
    document.getElementById("current-time").innerHTML = `
        <div style="font-weight: 500;">${timeString}</div>
        <div style="font-size: 0.75rem; opacity: 0.8;">${dateString}</div>
    `;
}

function getStatusClass(status) {
    switch (status) {
        case "success":
            return "status-success";
        case "warning":
            return "status-warning";
        case "error":
            return "status-error";
        default:
            return "status-pending";
    }
}

function getStatusIcon(status) {
    switch (status) {
        case "success":
            return "✓";
        case "warning":
            return "⚠";
        case "error":
            return "✗";
        default:
            return "○";
    }
}

function formatTime(dateString) {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Date invalide";
    return date.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatDuration(startDateString, endDateString) {
    if (!startDateString || !endDateString) return "N/A";
    const start = new Date(startDateString);
    const end = new Date(endDateString);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return "N/A";
    const durationMs = end.getTime() - start.getTime();
    const minutes = Math.floor(durationMs / 60000);
    const seconds = Math.floor((durationMs % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

function login(username, password) {
    if (VALID_CREDENTIALS[username] === password) {
        state.loggedInUser = username;
        document.getElementById("technician-name").value = username;
        document.getElementById("login-container").style.display = "none";
        document.getElementById("app-container").style.display = "block";
        setInterval(updateCurrentTime, 1000);
        updateCurrentTime();
        renderAll();
        return true;
    }
    return false;
}

function logout() {
    state.loggedInUser = null;
    document.getElementById("login-container").style.display = "flex";
    document.getElementById("app-container").style.display = "none";
    document.getElementById("login-form").reset();
}

function callNextClient() {
    if (state.currentClient) {
        alert("Un véhicule est déjà en cours de test. Veuillez terminer le test en cours avant d'appeler le suivant.");
        return;
    }
    if (state.waitingClients.length === 0) {
        alert("Aucun véhicule en attente.");
        return;
    }
    const nextClient = state.waitingClients.shift();
    nextClient.startTime = new Date().toISOString();
    nextClient.status = "in-progress";
    state.currentClient = nextClient;
    renderAll();
}

function completeCurrentClient() {
    if (!state.currentClient) return;
    const allTestsCompleted = state.currentClient.tests.every(test => test.status !== "pending");
    if (!allTestsCompleted) {
        const confirmComplete = confirm("Tous les tests ne sont pas terminés. Voulez-vous vraiment terminer cette visite ?");
        if (!confirmComplete) return;
    }
    state.currentClient.endTime = new Date().toISOString();
    state.currentClient.status = "completed";
    state.currentClient.technician = state.loggedInUser;
    state.history.unshift(state.currentClient);
    state.currentClient = null;
    renderAll();
}

function updateTestStatus(testId, status) {
    if (!state.currentClient) return;
    const test = state.currentClient.tests.find(t => t.id === testId);
    if (test) {
        test.status = status;
        renderCurrentClient();
    }
}

function renderCurrentClient() {
    const container = document.getElementById("current-client-container");
    const testsContainer = document.getElementById("current-tests-container");

    if (!state.currentClient) {
        container.innerHTML = '<p style="color: var(--text-secondary);">Aucun véhicule en cours</p>';
        testsContainer.innerHTML = '';
        return;
    }

    const client = state.currentClient;
    const startTime = client.startTime ? formatTime(client.startTime) : "N/A";
    const duration = client.startTime ? formatDuration(client.startTime, new Date().toISOString()) : "N/A";

    container.innerHTML = `
        <div class="client-number">${client.id}</div>
        <div class="client-status ${getStatusClass(client.status)}">
            <span class="status-icon">${getStatusIcon(client.status)}</span>
            En cours depuis ${duration}
        </div>
        <p style="margin-top: var(--spacing-md); color: var(--text-secondary);">
            Début: ${startTime}
        </p>
    `;

    testsContainer.innerHTML = `
        <h3 style="margin-bottom: var(--spacing-md); font-size: 1.125rem;">Tests à effectuer</h3>
        <ul class="tests-list">
            ${client.tests.map(test => `
                <li class="test-item">
                    <span class="test-name">
                        <span class="status-icon ${test.status === 'success' ? 'icon-success' : 
                            test.status === 'warning' ? 'icon-warning' : 
                            test.status === 'error' ? 'icon-error' : 'icon-pending'}">${getStatusIcon(test.status)}</span>
                        ${test.name}
                    </span>
                    <div class="test-status-buttons">
                        <button class="btn btn-success btn-sm ${test.status === 'success' ? 'selected' : ''}"
                            onclick="updateTestStatus('${test.id}', 'success')">✓</button>
                        <button class="btn btn-warning btn-sm ${test.status === 'warning' ? 'selected' : ''}"
                            onclick="updateTestStatus('${test.id}', 'warning')">⚠</button>
                        <button class="btn btn-error btn-sm ${test.status === 'error' ? 'selected' : ''}"
                            onclick="updateTestStatus('${test.id}', 'error')">✗</button>
                    </div>
                </li>
            `).join('')}
        </ul>
        <button class="btn btn-primary" style="width: 100%; margin-top: var(--spacing-lg);" 
                onclick="completeCurrentClient()">
            ✓ Terminer la visite
        </button>
    `;
}

function renderWaitingList() {
    const list = document.getElementById("waiting-list");
    const count = document.getElementById("queue-count");
    count.textContent = state.waitingClients.length;

    if (state.waitingClients.length === 0) {
        list.innerHTML = '<li style="text-align: center; color: var(--text-secondary); padding: var(--spacing-lg);">Aucun véhicule en attente</li>';
        return;
    }

    list.innerHTML = state.waitingClients.map((client, index) => `
        <li class="waiting-item">
            <div class="client-info">
                <div class="client-avatar">${index + 1}</div>
                <div class="client-id">${client.id}</div>
            </div>
            <div class="client-status ${getStatusClass(client.status)}">
                En attente
            </div>
        </li>
    `).join('');
}

function renderHistory() {
    const list = document.getElementById("history-list");
    const count = document.getElementById("history-count");
    count.textContent = state.history.length;

    if (state.history.length === 0) {
        list.innerHTML = '<li style="text-align: center; color: var(--text-secondary); padding: var(--spacing-lg);">Aucun historique</li>';
        return;
    }

    list.innerHTML = state.history.map(client => {
        const completedTests = client.tests.filter(t => t.status === 'success').length;
        const totalTests = client.tests.length;
        const successRate = Math.round((completedTests / totalTests) * 100);

        return `
            <li class="history-item" onclick="showHistoryDetail('${client.id}')">
                <div class="client-info">
                    <div class="client-id">${client.id}</div>
                    <div style="font-size: 0.875rem; color: var(--text-secondary);">
                        ${formatTime(client.startTime)} - ${formatTime(client.endTime)}
                    </div>
                </div>
                <div class="client-status status-success">
                    ${successRate}% réussite
                </div>
            </li>
        `;
    }).join('');
}

function showHistoryDetail(clientId) {
    const client = state.history.find(c => c.id === clientId);
    if (!client) return;

    document.getElementById("detail-visit-number").textContent = client.id;
    document.getElementById("detail-vehicle-id").textContent = client.id;
    document.getElementById("detail-technician").textContent = client.technician || "N/A";
    document.getElementById("detail-start-time").textContent = formatTime(client.startTime);
    document.getElementById("detail-end-time").textContent = formatTime(client.endTime);
    document.getElementById("detail-duration").textContent = formatDuration(client.startTime, client.endTime);

    const testsList = document.getElementById("detail-tests-list");
    testsList.innerHTML = client.tests.map(test => `
        <li style="padding: var(--spacing-sm); border-left: 3px solid ${
            test.status === 'success' ? 'var(--success-color)' : 
            test.status === 'warning' ? 'var(--warning-color)' : 
            test.status === 'error' ? 'var(--error-color)' : 'var(--gray-300)'
        }; margin-bottom: var(--spacing-sm);">
            <strong>${test.name}</strong>
            <span class="status-icon ${test.status === 'success' ? 'icon-success' : 
                test.status === 'warning' ? 'icon-warning' : 
                test.status === 'error' ? 'icon-error' : 'icon-pending'}" 
                style="margin-left: var(--spacing-sm);">
                ${getStatusIcon(test.status)}
            </span>
            ${test.notes ? `<div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: var(--spacing-xs);">${test.notes}</div>` : ''}
        </li>
    `).join('');

    document.getElementById("history-detail-overlay").style.display = "flex";
}

function hideHistoryDetail() {
    document.getElementById("history-detail-overlay").style.display = "none";
}

// Reports functionality
function generateReport() {
    const period = document.getElementById("report-period").value;
    const reportData = calculateReportData(period);
    
    if (reportData.visits.length === 0) {
        alert("Aucune donnée disponible pour la période sélectionnée.");
        return;
    }
    
    state.currentReport = reportData;
    displayReport(reportData);
    
    // Enable download buttons
    document.getElementById("download-report-btn").disabled = false;
    document.getElementById("download-pdf-btn").disabled = false;
}

function calculateReportData(period) {
    const now = new Date();
    let startDate;
    
    switch (period) {
        case "today":
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case "3days":
            startDate = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
            break;
        case "week":
            startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
            break;
        default:
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    
    // Filter history based on period
    const filteredVisits = state.history.filter(visit => {
        const visitDate = new Date(visit.startTime);
        return visitDate >= startDate;
    });
    
    // Calculate statistics
    const totalVisits = filteredVisits.length;
    const totalDuration = filteredVisits.reduce((sum, visit) => {
        const duration = new Date(visit.endTime) - new Date(visit.startTime);
        return sum + duration;
    }, 0);
    const avgDuration = totalVisits > 0 ? Math.round(totalDuration / totalVisits / 60000) : 0;
    
    // Calculate test statistics
    const testStats = {};
    TEST_TYPES.forEach(testType => {
        testStats[testType.id] = {
            name: testType.name,
            total: 0,
            success: 0,
            warning: 0,
            error: 0
        };
    });
    
    filteredVisits.forEach(visit => {
        visit.tests.forEach(test => {
            if (testStats[test.id]) {
                testStats[test.id].total++;
                if (test.status === 'success') testStats[test.id].success++;
                else if (test.status === 'warning') testStats[test.id].warning++;
                else if (test.status === 'error') testStats[test.id].error++;
            }
        });
    });
    
    // Calculate overall success rate
    const totalTests = Object.values(testStats).reduce((sum, stat) => sum + stat.total, 0);
    const totalSuccessTests = Object.values(testStats).reduce((sum, stat) => sum + stat.success, 0);
    const overallSuccessRate = totalTests > 0 ? Math.round((totalSuccessTests / totalTests) * 100) : 0;
    
    return {
        period,
        startDate,
        endDate: now,
        visits: filteredVisits,
        totalVisits,
        avgDuration,
        overallSuccessRate,
        testStats
    };
}

function displayReport(reportData) {
    const container = document.getElementById("report-container");
    const title = document.getElementById("report-title");
    const periodText = document.getElementById("report-period-text");
    const totalVisits = document.getElementById("total-visits");
    const avgDuration = document.getElementById("avg-duration");
    const successRate = document.getElementById("success-rate");
    const tableBody = document.getElementById("report-table-body");
    
    // Update header
    let periodLabel;
    switch (reportData.period) {
        case "today":
            periodLabel = "Aujourd'hui";
            break;
        case "3days":
            periodLabel = "3 derniers jours";
            break;
        case "week":
            periodLabel = "Cette semaine";
            break;
        default:
            periodLabel = "Période sélectionnée";
    }
    
    title.textContent = `Rapport d'Analyse - ${periodLabel}`;
    periodText.textContent = `Du ${reportData.startDate.toLocaleDateString('fr-FR')} au ${reportData.endDate.toLocaleDateString('fr-FR')}`;
    
    // Update stats
    totalVisits.textContent = reportData.totalVisits;
    avgDuration.textContent = `${reportData.avgDuration}min`;
    successRate.textContent = `${reportData.overallSuccessRate}%`;
    
    // Update table
    tableBody.innerHTML = Object.values(reportData.testStats).map(stat => {
        const successRate = stat.total > 0 ? Math.round((stat.success / stat.total) * 100) : 0;
        let rateClass = 'success-rate';
        if (successRate >= 80) rateClass += ' high';
        else if (successRate >= 60) rateClass += ' medium';
        else rateClass += ' low';
        
        return `
            <tr>
                <td><strong>${stat.name}</strong></td>
                <td>${stat.total}</td>
                <td>${stat.success}</td>
                <td>${stat.warning}</td>
                <td>${stat.error}</td>
                <td class="${rateClass}">${successRate}%</td>
            </tr>
        `;
    }).join('');
    
    // Show report container
    container.style.display = "block";
}

function downloadReportExcel() {
    if (!state.currentReport) {
        alert("Aucun rapport généré. Veuillez d'abord générer un rapport.");
        return;
    }
    
    // Prepare data for Excel
    let periodLabel;
    switch (state.currentReport.period) {
        case "today":
            periodLabel = "Aujourd'hui";
            break;
        case "3days":
            periodLabel = "3 derniers jours";
            break;
        case "week":
            periodLabel = "Cette semaine";
            break;
        default:
            periodLabel = "Période sélectionnée";
    }
    
    const currentDate = new Date();
    const dateStr = currentDate.toLocaleDateString('fr-FR');
    const timeStr = currentDate.toLocaleTimeString('fr-FR');
    
    // Create properly formatted CSV content for Excel with BOM for UTF-8
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    
    // Header section with report title
    csvContent += `"GTA - RAPPORT D'ANALYSE TECHNIQUE",,,,,,\n`;
    csvContent += `"Date: ${dateStr} - Heure: ${timeStr}",,,,,,\n`;
    csvContent += `"Période: ${periodLabel}",,,,,,\n`;
    csvContent += `"Technicien: ${state.loggedInUser}",,,,,,\n`;
    csvContent += `,,,,,,\n`;
    
    // Summary statistics in organized rows
    csvContent += `"RÉSUMÉ EXÉCUTIF",,,,,,\n`;
    csvContent += `"Visites totales","Durée moyenne","Taux de réussite",,,\n`;
    csvContent += `"${state.currentReport.totalVisits}","${state.currentReport.avgDuration} min","${state.currentReport.overallSuccessRate}%",,,\n`;
    csvContent += `,,,,,,\n`;
    
    // Main analysis table exactly like the web interface
    csvContent += `"ANALYSE DÉTAILLÉE PAR TYPE DE TEST",,,,,,\n`;
    csvContent += `"Test","Total","Réussis","Avertissements","Échecs","Taux de réussite"\n`;
    
    // Add test data in clean table format
    Object.values(state.currentReport.testStats).forEach(stat => {
        const successRate = stat.total > 0 ? Math.round((stat.success / stat.total) * 100) : 0;
        csvContent += `"${stat.name}","${stat.total}","${stat.success}","${stat.warning}","${stat.error}","${successRate}%"\n`;
    });
    
    // Create download link with professional filename
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const filename = `GTA_Rapport_${periodLabel.replace(/\s+/g, '_')}_${currentDate.toISOString().split('T')[0]}.csv`;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function downloadReportPDF() {
    if (!state.currentReport) {
        alert("Aucun rapport généré. Veuillez d'abord générer un rapport.");
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Get period label
    let periodLabel;
    switch (state.currentReport.period) {
        case "today":
            periodLabel = "Aujourd'hui";
            break;
        case "3days":
            periodLabel = "3 derniers jours";
            break;
        case "week":
            periodLabel = "Cette semaine";
            break;
        default:
            periodLabel = "Période sélectionnée";
    }
    
    const currentDate = new Date();
    
    // Header - Title
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Rapport d'Analyse - " + periodLabel, 105, 30, { align: 'center' });
    
    // Subtitle with dates
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    const dateRange = `Du ${state.currentReport.startDate.toLocaleDateString('fr-FR')} au ${state.currentReport.endDate.toLocaleDateString('fr-FR')}`;
    doc.text(dateRange, 105, 40, { align: 'center' });
    
    // Statistics cards section
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    
    // Card 1 - Visites totales
    doc.rect(20, 60, 50, 30);
    doc.setFontSize(24);
    doc.setTextColor(37, 99, 235); // Primary blue
    doc.text(state.currentReport.totalVisits.toString(), 45, 75, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // Gray
    doc.text("Visites totales", 45, 85, { align: 'center' });
    
    // Card 2 - Durée moyenne
    doc.rect(80, 60, 50, 30);
    doc.setFontSize(24);
    doc.setTextColor(37, 99, 235);
    doc.text(state.currentReport.avgDuration + "min", 105, 75, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("Durée moyenne", 105, 85, { align: 'center' });
    
    // Card 3 - Taux de réussite
    doc.rect(140, 60, 50, 30);
    doc.setFontSize(24);
    doc.setTextColor(37, 99, 235);
    doc.text(state.currentReport.overallSuccessRate + "%", 165, 75, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text("% réussite", 165, 85, { align: 'center' });
    
    // Table section
    let yPosition = 110;
    
    // Table header
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    
    // Draw table header background
    doc.setFillColor(241, 245, 249); // Light gray
    doc.rect(20, yPosition, 170, 10, 'F');
    
    // Table headers
    doc.text("Test", 25, yPosition + 7);
    doc.text("Total", 60, yPosition + 7);
    doc.text("Réussis", 80, yPosition + 7);
    doc.text("Avertissements", 105, yPosition + 7);
    doc.text("Échecs", 145, yPosition + 7);
    doc.text("Taux de réussite", 165, yPosition + 7);
    
    yPosition += 10;
    
    // Table data
    doc.setFont("helvetica", "normal");
    Object.values(state.currentReport.testStats).forEach((stat, index) => {
        const successRate = stat.total > 0 ? Math.round((stat.success / stat.total) * 100) : 0;
        
        // Alternate row colors
        if (index % 2 === 0) {
            doc.setFillColor(248, 250, 252); // Very light gray
            doc.rect(20, yPosition, 170, 8, 'F');
        }
        
        // Text color based on success rate
        if (successRate >= 80) {
            doc.setTextColor(22, 163, 74); // Green
        } else if (successRate >= 60) {
            doc.setTextColor(234, 88, 12); // Orange
        } else {
            doc.setTextColor(220, 38, 38); // Red
        }
        
        doc.text(stat.name, 25, yPosition + 6);
        doc.setTextColor(0, 0, 0); // Reset to black for numbers
        doc.text(stat.total.toString(), 65, yPosition + 6, { align: 'center' });
        doc.text(stat.success.toString(), 85, yPosition + 6, { align: 'center' });
        doc.text(stat.warning.toString(), 115, yPosition + 6, { align: 'center' });
        doc.text(stat.error.toString(), 150, yPosition + 6, { align: 'center' });
        
        // Success rate with color
        if (successRate >= 80) {
            doc.setTextColor(22, 163, 74);
        } else if (successRate >= 60) {
            doc.setTextColor(234, 88, 12);
        } else {
            doc.setTextColor(220, 38, 38);
        }
        doc.text(successRate + "%", 175, yPosition + 6, { align: 'center' });
        
        yPosition += 8;
    });
    
    // Footer
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Généré le ${currentDate.toLocaleDateString('fr-FR')} à ${currentDate.toLocaleTimeString('fr-FR')} par ${state.loggedInUser}`, 105, 280, { align: 'center' });
    
    // Save PDF
    const filename = `GTA_Rapport_${periodLabel.replace(/\s+/g, '_')}_${currentDate.toISOString().split('T')[0]}.pdf`;
    doc.save(filename);
}

// Technician management
function loadTechnicians() {
    const techniciansList = document.getElementById("technicians-list");
    const technicians = Object.keys(VALID_CREDENTIALS);
    
    techniciansList.innerHTML = technicians.map(username => `
        <li class="technician-item">
            <span class="technician-name">${username}</span>
            ${username !== 'admin' ? `<button class="delete-technician-btn" onclick="deleteTechnician('${username}')">🗑️</button>` : ''}
        </li>
    `).join('');
}

function addTechnician() {
    const username = document.getElementById("new-technician-username").value.trim();
    const password = document.getElementById("new-technician-password").value;
    const confirmPassword = document.getElementById("new-technician-confirm").value;
    
    if (!username || !password || !confirmPassword) {
        alert("Veuillez remplir tous les champs.");
        return;
    }
    
    if (password !== confirmPassword) {
        alert("Les mots de passe ne correspondent pas.");
        return;
    }
    
    if (VALID_CREDENTIALS[username]) {
        alert("Ce nom d'utilisateur existe déjà.");
        return;
    }
    
    VALID_CREDENTIALS[username] = password;
    document.getElementById("add-technician-form").reset();
    loadTechnicians();
    alert("Technicien ajouté avec succès.");
}

function deleteTechnician(username) {
    if (username === 'admin') {
        alert("Impossible de supprimer l'administrateur.");
        return;
    }
    
    if (username === state.loggedInUser) {
        alert("Impossible de supprimer votre propre compte.");
        return;
    }
    
    if (confirm(`Êtes-vous sûr de vouloir supprimer le technicien "${username}" ?`)) {
        delete VALID_CREDENTIALS[username];
        loadTechnicians();
        alert("Technicien supprimé avec succès.");
    }
}

function renderAll() {
    renderCurrentClient();
    renderWaitingList();
    renderHistory();
    loadTechnicians();
}



