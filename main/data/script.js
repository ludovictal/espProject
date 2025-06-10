const TEST_TYPES = [
    { id: "freins", name: "Test des freins" },
    { id: "parallelisme", name: "Parallélisme" },
    { id: "eclairage", name: "Éclairage" },
    { id: "pollution", name: "Contrôle pollution" },
    { id: "vidange", name: "Vidange" }
];

let state = {
    waitingClients: [
        {
            id: "VT-001",
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
            id: "VT-002",
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
    loggedInUser: null
};

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
    document.getElementById("current-time").innerHTML = 
        `<div style="font-weight: 500;">${timeString}</div><div style="font-size: 0.75rem; opacity: 0.8;">${dateString}</div>`;
}

function getStatusClass(status) {
    switch(status) {
        case "success": return "status-success";
        case "warning": return "status-warning";
        case "error": return "status-error";
        default: return "status-pending";
    }
}

function getStatusIcon(status) {
    switch(status) {
        case "success": return "✓";
        case "warning": return "⚠";
        case "error": return "✗";
        default: return "○";
    }
}

function formatTime(dateString) {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "Date invalide";
    return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
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
    const duration = client.startTime ? 
        formatDuration(client.startTime, new Date().toISOString()) : "N/A";

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
                            test.status === 'error' ? 'icon-error' : 'icon-pending'}">
                            ${getStatusIcon(test.status)}
                        </span>
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
                <div class="history-actions">
                    <div class="client-status status-success">
                        ${successRate}% réussite
                    </div>
                    <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); downloadClientPDF('${client.id}')">
                        📄 PDF
                    </button>
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

function downloadClientPDF(clientId) {
    const client = state.history.find(c => c.id === clientId);
    if (!client) return;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - (2 * margin);

    // En-tête avec logo et titre
    doc.setFillColor(37, 99, 235); // Couleur primaire
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    // Logo "G"
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text("G", margin, 25);
    
    // Titre
    doc.setFontSize(20);
    doc.text("GTA - Rapport de Visite Technique", margin + 15, 25);
    
    // Date de génération
    doc.setFontSize(10);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, pageWidth - margin, 15, { align: 'right' });
    
    // Informations principales
    doc.setTextColor(15, 23, 42); // Couleur texte primaire
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text("Informations de la visite", margin, 60);
    
    // Ligne de séparation
    doc.setDrawColor(226, 232, 240); // Couleur gris clair
    doc.line(margin, 65, pageWidth - margin, 65);
    
    // Détails de la visite
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    const details = [
        { label: "Véhicule", value: client.id },
        { label: "Technicien", value: client.technician || 'N/A' },
        { label: "Date", value: new Date(client.startTime).toLocaleDateString('fr-FR') },
        { label: "Heure début", value: formatTime(client.startTime) },
        { label: "Heure fin", value: formatTime(client.endTime) },
        { label: "Durée", value: formatDuration(client.startTime, client.endTime) }
    ];
    
    let yPos = 80;
    details.forEach(detail => {
        doc.setFont(undefined, 'bold');
        doc.text(`${detail.label} :`, margin, yPos);
        doc.setFont(undefined, 'normal');
        doc.text(detail.value, margin + 50, yPos);
        yPos += 10;
    });

    // Tests effectués
    yPos += 10;
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text("Tests effectués", margin, yPos);
    doc.line(margin, yPos + 5, pageWidth - margin, yPos + 5);
    
    yPos += 15;
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    
    client.tests.forEach(test => {
        if (yPos > 250) {
            doc.addPage();
            yPos = 40;
        }
        
        const statusText = test.status === 'success' ? 'RÉUSSI' : 
                          test.status === 'warning' ? 'ATTENTION' : 
                          test.status === 'error' ? 'ÉCHEC' : 'NON TESTÉ';
        
        // Couleur du statut
        switch(test.status) {
            case 'success':
                doc.setTextColor(22, 163, 74); // Vert
                break;
            case 'warning':
                doc.setTextColor(234, 88, 12); // Orange
                break;
            case 'error':
                doc.setTextColor(220, 38, 38); // Rouge
                break;
            default:
                doc.setTextColor(100, 116, 139); // Gris
        }
        
        // Icône du statut
        const statusIcon = test.status === 'success' ? '✓' : 
                          test.status === 'warning' ? '⚠' : 
                          test.status === 'error' ? '✗' : '○';
        
        doc.text(`${statusIcon} ${test.name}: ${statusText}`, margin + 5, yPos);
        yPos += 10;
        
        // Réinitialiser la couleur pour le texte suivant
        doc.setTextColor(15, 23, 42);
    });

    // Pied de page
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(
            `Page ${i} sur ${pageCount}`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 10,
            { align: 'center' }
        );
    }

    doc.save(`GTA_${client.id}_${new Date().toISOString().split('T')[0]}.pdf`);
}

function downloadAllHistoryPDF() {
    if (state.history.length === 0) {
        alert("Aucun historique à télécharger.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const contentWidth = pageWidth - (2 * margin);

    // En-tête avec logo et titre
    doc.setFillColor(37, 99, 235); // Couleur primaire
    doc.rect(0, 0, pageWidth, 40, 'F');
    
    // Logo "G"
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text("G", margin, 25);
    
    // Titre
    doc.setFontSize(20);
    doc.text("GTA - Historique Complet", margin + 15, 25);
    
    // Date de génération
    doc.setFontSize(10);
    doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, pageWidth - margin, 15, { align: 'right' });
    
    // Informations de génération
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Technicien: ${state.loggedInUser}`, margin, 60);
    doc.text(`Nombre de visites: ${state.history.length}`, margin, 70);

    let yPos = 90;
    state.history.forEach((client, index) => {
        if (yPos > 250) {
            doc.addPage();
            yPos = 40;
        }

        // En-tête de la visite
        doc.setFillColor(241, 245, 249); // Fond gris très clair
        doc.rect(margin - 5, yPos - 10, contentWidth + 10, 15, 'F');
        
        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text(`${index + 1}. Véhicule ${client.id}`, margin, yPos);
        
        yPos += 15;
        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');
        
        // Détails de la visite
        const details = [
            { label: "Début", value: formatTime(client.startTime) },
            { label: "Fin", value: formatTime(client.endTime) },
            { label: "Durée", value: formatDuration(client.startTime, client.endTime) },
            { label: "Technicien", value: client.technician || 'N/A' }
        ];
        
        details.forEach(detail => {
            doc.setFont(undefined, 'bold');
            doc.text(`${detail.label}:`, margin, yPos);
            doc.setFont(undefined, 'normal');
            doc.text(detail.value, margin + 40, yPos);
            yPos += 8;
        });

        // Résumé des tests
        const completedTests = client.tests.filter(t => t.status === 'success').length;
        const totalTests = client.tests.length;
        const successRate = Math.round((completedTests / totalTests) * 100);
        
        doc.setFont(undefined, 'bold');
        doc.text("Résumé des tests:", margin, yPos);
        doc.setFont(undefined, 'normal');
        yPos += 8;
        
        // Barre de progression
        const barWidth = 100;
        const barHeight = 8;
        const successWidth = (barWidth * successRate) / 100;
        
        // Fond de la barre
        doc.setFillColor(226, 232, 240);
        doc.rect(margin, yPos, barWidth, barHeight, 'F');
        
        // Partie réussie
        doc.setFillColor(22, 163, 74);
        doc.rect(margin, yPos, successWidth, barHeight, 'F');
        
        // Texte du pourcentage
        doc.setTextColor(15, 23, 42);
        doc.text(`${successRate}% réussite`, margin + barWidth + 10, yPos + 6);
        
        yPos += 25;
    });

    // Pied de page
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        doc.text(
            `Page ${i} sur ${pageCount}`,
            pageWidth / 2,
            doc.internal.pageSize.getHeight() - 10,
            { align: 'center' }
        );
    }

    doc.save(`GTA_Historique_${new Date().toISOString().split('T')[0]}.pdf`);
}

function renderAll() {
    renderCurrentClient();
    renderWaitingList();
    renderHistory();
    renderTechniciansList();
}

// Modifier la variable VALID_CREDENTIALS pour être mutable
let VALID_CREDENTIALS = {
    "ludovic": "ludotech17",
    "tech2": "motdepasse2"
};

// Charger les credentials depuis le localStorage au démarrage
function loadCredentials() {
    const savedCredentials = localStorage.getItem('gta_credentials');
    if (savedCredentials) {
        VALID_CREDENTIALS = JSON.parse(savedCredentials);
    }
}

// Sauvegarder les credentials dans le localStorage
function saveCredentials() {
    localStorage.setItem('gta_credentials', JSON.stringify(VALID_CREDENTIALS));
}

// Rendre la liste des techniciens
function renderTechniciansList() {
    const list = document.getElementById('technicians-list');
    const technicians = Object.keys(VALID_CREDENTIALS);
    
    if (technicians.length === 0) {
        list.innerHTML = '<li style="text-align: center; color: var(--text-secondary); padding: var(--spacing-lg);">Aucun technicien</li>';
        return;
    }
    
    list.innerHTML = technicians.map(username => `
        <li class="technician-item ${username === state.loggedInUser ? 'current-user' : ''}">
            <div class="technician-info">
                <div class="technician-avatar">${username.charAt(0).toUpperCase()}</div>
                <span class="technician-name">${username}</span>
            </div>
            ${username !== state.loggedInUser ? 
                `<button class="btn btn-danger btn-sm" onclick="removeTechnician('${username}')">
                    🗑️ Supprimer
                </button>` : 
                '<span style="color: var(--success-color); font-size: 0.75rem;">●</span>'
            }
        </li>
    `).join('');
}

// Ajouter un nouveau technicien
function addTechnician(username, password) {
    // Vérifications
    if (!username || !password) {
        alert('Veuillez remplir tous les champs.');
        return false;
    }
    
    if (username.length < 3) {
        alert('L\'identifiant doit contenir au moins 3 caractères.');
        return false;
    }
    
    if (password.length < 6) {
        alert('Le mot de passe doit contenir au moins 6 caractères.');
        return false;
    }
    
    if (VALID_CREDENTIALS[username]) {
        alert('Cet identifiant existe déjà.');
        return false;
    }
    
    // Ajouter le technicien
    VALID_CREDENTIALS[username] = password;
    saveCredentials();
    renderTechniciansList();
    
    // Reset du formulaire
    document.getElementById('add-technician-form').reset();
    
    alert(`Technicien "${username}" ajouté avec succès !`);
    return true;
}

// Supprimer un technicien
function removeTechnician(username) {
    if (username === state.loggedInUser) {
        alert('Vous ne pouvez pas supprimer votre propre compte.');
        return;
    }
    
    if (Object.keys(VALID_CREDENTIALS).length <= 1) {
        alert('Impossible de supprimer le dernier technicien.');
        return;
    }
    
    const confirmDelete = confirm(`Êtes-vous sûr de vouloir supprimer le technicien "${username}" ?\nCette action est irréversible.`);
    
    if (confirmDelete) {
        delete VALID_CREDENTIALS[username];
        saveCredentials();
        renderTechniciansList();
        alert(`Technicien "${username}" supprimé avec succès.`);
    }
}

// Event Listeners
document.getElementById("login-form").addEventListener("submit", function(e) {
    e.preventDefault();
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    
    if (login(username, password)) {
        // Login successful
    } else {
        alert("Identifiants incorrects. Veuillez réessayer.");
    }
});

document.getElementById("logout-btn").addEventListener("click", logout);
document.getElementById("call-next-btn").addEventListener("click", callNextClient);
document.getElementById("download-all-btn").addEventListener("click", downloadAllHistoryPDF);
document.getElementById("history-detail-close-btn").addEventListener("click", hideHistoryDetail);

// Close modal when clicking outside
document.getElementById("history-detail-overlay").addEventListener("click", function(e) {
    if (e.target === this) {
        hideHistoryDetail();
    }
});

// Gestionnaire pour le formulaire d'ajout
document.getElementById('add-technician-form').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const username = document.getElementById('new-technician-username').value.trim();
    const password = document.getElementById('new-technician-password').value;
    const confirmPassword = document.getElementById('new-technician-confirm').value;
    
    if (password !== confirmPassword) {
        alert('Les mots de passe ne correspondent pas.');
        return;
    }
    
    addTechnician(username, password);
});

// Simulate new clients joining the queue periodically
setInterval(() => {
    if (Math.random() < 0.1 && state.waitingClients.length < 10) { // 10% chance every 30 seconds
        const newClientNumber = Math.floor(Math.random() * 9000) + 1000;
        const newClient = {
            id: `VT-${newClientNumber}`,
            status: "pending",
            startTime: null,
            endTime: null,
            tests: TEST_TYPES.map(test => ({
                id: test.id,
                name: test.name,
                status: "pending",
                notes: ""
            }))
        };
        state.waitingClients.push(newClient);
        renderWaitingList();
    }
}, 30000);

// Initialize the application
updateCurrentTime();

// Charger les credentials au démarrage de l'application
document.addEventListener('DOMContentLoaded', function() {
    loadCredentials();
});

// Initialiser au chargement
loadCredentials(); 