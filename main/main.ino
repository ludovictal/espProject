#include <ESP8266WiFi.h>
#include <ESP8266WebServer.h>
#include <ESP8266mDNS.h>
#include <WiFiManager.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <SoftwareSerial.h>
#include <DFRobotDFPlayerMini.h>
#include <ArduinoJson.h>
#include <EEPROM.h>
#include <LittleFS.h>
#include <WebSocketsServer.h>

// Configuration WiFi
const char* WIFI_AP_NAME = "GTA_Config";
const char* WIFI_AP_PASSWORD = "12345678";
const int WM_CONFIG_TIMEOUT = 180; // 3 minutes
const char* MDNS_NAME = "gta";

// Configuration WebSocket
WebSocketsServer webSocket = WebSocketsServer(81);
bool webSocketConnected = false;

// Structure optimisée pour le stockage
struct Visit {
    uint16_t number;      // 2 bytes
    char brakes[8];       // 8 bytes
    char alignment[8];    // 8 bytes
    char visual[8];       // 8 bytes
    uint32_t timestamp;   // 4 bytes
} __attribute__((packed));  // Total: 30 bytes

// Classe de gestion du stockage
class StorageManager {
private:
    static const uint16_t MAX_VISITS = 100;
    static const char* HISTORY_FILE = "/history.json";
    Visit visits[MAX_VISITS];
    uint16_t visitCount;

    bool saveToLittleFS() {
        File file = LittleFS.open(HISTORY_FILE, "w");
        if (!file) {
            Serial.println("Erreur d'ouverture du fichier en écriture");
            return false;
        }

        StaticJsonDocument<4096> doc;
        JsonArray array = doc.to<JsonArray>();

        for (uint16_t i = 0; i < visitCount; i++) {
            JsonObject visitObj = array.createNestedObject();
            visitObj["number"] = visits[i].number;
            visitObj["brakes"] = visits[i].brakes;
            visitObj["alignment"] = visits[i].alignment;
            visitObj["visual"] = visits[i].visual;
            visitObj["timestamp"] = visits[i].timestamp;
        }

        if (serializeJson(doc, file) == 0) {
            Serial.println("Erreur d'écriture dans le fichier");
            file.close();
            return false;
        }

        file.close();
        return true;
    }

    bool loadFromLittleFS() {
        if (!LittleFS.exists(HISTORY_FILE)) {
            Serial.println("Fichier d'historique non trouvé");
            return false;
        }

        File file = LittleFS.open(HISTORY_FILE, "r");
        if (!file) {
            Serial.println("Erreur d'ouverture du fichier en lecture");
            return false;
        }

        StaticJsonDocument<4096> doc;
        DeserializationError error = deserializeJson(doc, file);
        file.close();

        if (error) {
            Serial.println("Erreur de désérialisation JSON");
            return false;
        }

        JsonArray array = doc.as<JsonArray>();
        visitCount = 0;

        for (JsonObject visitObj : array) {
            if (visitCount >= MAX_VISITS) break;

            visits[visitCount].number = visitObj["number"] | 0;
            strlcpy(visits[visitCount].brakes, visitObj["brakes"] | "", sizeof(visits[visitCount].brakes));
            strlcpy(visits[visitCount].alignment, visitObj["alignment"] | "", sizeof(visits[visitCount].alignment));
            strlcpy(visits[visitCount].visual, visitObj["visual"] | "", sizeof(visits[visitCount].visual));
            visits[visitCount].timestamp = visitObj["timestamp"] | 0;
            visitCount++;
        }

        return true;
    }

public:
    StorageManager() : visitCount(0) {
        if (!LittleFS.begin()) {
            Serial.println("Erreur d'initialisation LittleFS");
            return;
        }
        loadFromLittleFS();
    }
    
    bool addVisit(const Visit& visit) {
        if (visitCount >= MAX_VISITS) {
            // Rotation des données : supprime la plus ancienne entrée
            for (uint16_t i = 0; i < visitCount - 1; i++) {
                visits[i] = visits[i + 1];
            }
            visitCount--;
        }
        
        visits[visitCount++] = visit;
        return saveToLittleFS();
    }
    
    bool getVisit(uint16_t index, Visit& visit) {
        if (index >= visitCount) return false;
        visit = visits[index];
        return true;
    }
    
    uint16_t getVisitCount() const {
        return visitCount;
    }
    
    bool clearHistory() {
        visitCount = 0;
        return saveToLittleFS();
    }
    
    void maintenance() {
        static uint32_t lastMaintenance = 0;
        if (millis() - lastMaintenance > 3600000) { // Toutes les heures
            if (!LittleFS.exists(HISTORY_FILE)) {
                saveToLittleFS();
            }
            
            Dir dir = LittleFS.openDir("/");
            while (dir.next()) {
                String fileName = dir.fileName();
                if (fileName.startsWith("/temp_")) {
                    LittleFS.remove(fileName);
                }
            }
            
            lastMaintenance = millis();
        }
    }
};

// Instance globale du gestionnaire de stockage
StorageManager storage;

// Pins pour les décodeurs BCD
const int BCD_A = 5;  // D1
const int BCD_B = 4;  // D2
const int BCD_C = 12; // D6
const int BCD_D = 13; // D7
const int DIGIT1_EN = 14;  // D5
const int DIGIT2_EN = 15;  // D8

// Pin pour le bouton
const int buttonPin = 14; // D5 avec pull-up interne

// Configuration LCD
LiquidCrystal_I2C lcd(0x27, 16, 2);

// Configuration DFPlayer
SoftwareSerial mySoftwareSerial(12, 13); // RX (D6), TX (D7)
DFRobotDFPlayerMini myDFPlayer;

// Variables globales
int currentNumber = 0;
bool isProcessing = false;
String currentStatus = "";
unsigned long lastButtonPress = 0;
const unsigned long debounceDelay = 300; // Augmenté pour éviter les doubles appuis

// Tableau pour stocker l'historique
const int MAX_HISTORY = 100;
Visit history[MAX_HISTORY];
int historyCount = 0;

// Création du serveur web et WiFiManager
ESP8266WebServer server(80);
WiFiManager wm;

// Configuration de l'EEPROM
const int EEPROM_SIZE = 512;

// Patterns pour les afficheurs 7 segments (anode commune)
const byte digitPatterns[] = {
    B00000011, // 0
    B10011111, // 1
    B00100101, // 2
    B00001101, // 3
    B10011001, // 4
    B01001001, // 5
    B01000001, // 6
    B00011111, // 7
    B00000001, // 8
    B00001001  // 9
};

// LED de statut WiFi
const int LED_WIFI = 16; // D0

// Déclarations anticipées des fonctions
void onWiFiConnect(const WiFiEventStationModeGotIP& event);
void onWiFiDisconnect(const WiFiEventStationModeDisconnected& event);

// Fonction de callback pour les événements WebSocket
void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
    switch(type) {
        case WStype_DISCONNECTED:
            webSocketConnected = false;
            Serial.printf("[WebSocket] Client #%u déconnecté\n", num);
            break;
            
        case WStype_CONNECTED:
            webSocketConnected = true;
            Serial.printf("[WebSocket] Client #%u connecté\n", num);
            // Envoi immédiat de l'état actuel
            sendCurrentState(num);
            break;
            
        case WStype_TEXT:
            // Traitement des commandes reçues
            handleWebSocketCommand(num, payload, length);
            break;
    }
}

// Envoi de l'état actuel via WebSocket
void sendCurrentState(uint8_t num) {
    StaticJsonDocument<256> doc;
    doc["type"] = "state";
    doc["number"] = currentNumber;
    doc["status"] = currentStatus;
    
    String response;
    serializeJson(doc, response);
    webSocket.sendTXT(num, response);
}

// Diffusion de l'état à tous les clients connectés
void broadcastState() {
    if (!webSocketConnected) return;
    
    StaticJsonDocument<256> doc;
    doc["type"] = "state";
    doc["number"] = currentNumber;
    doc["status"] = currentStatus;
    
    String response;
    serializeJson(doc, response);
    webSocket.broadcastTXT(response);
}

// Traitement des commandes WebSocket
void handleWebSocketCommand(uint8_t num, uint8_t * payload, size_t length) {
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, payload, length);
    
    if (error) {
        Serial.println("Erreur de parsing JSON WebSocket");
        return;
    }
    
    const char* command = doc["command"];
    if (strcmp(command, "reset") == 0) {
        currentNumber = 0;
        EEPROM.write(0, currentNumber);
        EEPROM.commit();
        broadcastState();
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n");
    Serial.println("=================================");
    Serial.println("🔄 Démarrage GTA ESP8266...");
    Serial.println("=================================");
    
    // Configuration des pins
    Serial.println("[PIN] Configuration des pins...");
    pinMode(BCD_A, OUTPUT);
    pinMode(BCD_B, OUTPUT);
    pinMode(BCD_C, OUTPUT);
    pinMode(BCD_D, OUTPUT);
    pinMode(DIGIT1_EN, OUTPUT);
    pinMode(DIGIT2_EN, OUTPUT);
    pinMode(buttonPin, INPUT_PULLUP);
    pinMode(LED_WIFI, OUTPUT);
    digitalWrite(LED_WIFI, LOW);
    Serial.println("[PIN] Configuration terminée");
    
    // Initialisation LCD
    Serial.println("[LCD] Initialisation...");
    Wire.begin(4, 5); // SDA (D2), SCL (D1)
    lcd.init();
    lcd.backlight();
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Systeme pret");
    lcd.setCursor(0, 1);
    lcd.print("Attente client...");
    Serial.println("[LCD] Initialisation terminée");
    
    // Initialisation DFPlayer
    mySoftwareSerial.begin(9600);
    if (!myDFPlayer.begin(mySoftwareSerial)) {
        Serial.println("Erreur DFPlayer");
    }
    myDFPlayer.volume(20);
    
    // Initialisation EEPROM
    EEPROM.begin(EEPROM_SIZE);
    currentNumber = EEPROM.read(0);
    if (currentNumber == 255) currentNumber = 0;
    
    // Initialisation LittleFS
    if (!LittleFS.begin()) {
        Serial.println("Erreur LittleFS");
        return;
    }
    
    // Configuration WiFi
    setupWiFi();
    
    // Initialisation WebSocket
    webSocket.begin();
    webSocket.onEvent(webSocketEvent);
    Serial.println("[WebSocket] Serveur démarré sur le port 81");
    
    // Configuration des routes du serveur web
    setupWebServer();
    
    // Affichage initial
    displayNumber(currentNumber);
    lcd.clear();
    lcd.print("Systeme pret");
    
    Serial.println("✅ GTA ESP8266 prêt !");
}

void loop() {
    if (WiFi.status() == WL_CONNECTED) {
        server.handleClient();
        MDNS.update();
        webSocket.loop();  // Gestion des WebSockets
        
        // Vérification périodique du mDNS
        static unsigned long lastMDNSCheck = 0;
        if (millis() - lastMDNSCheck > 30000) {
            lastMDNSCheck = millis();
            if (!MDNS.isRunning()) {
                Serial.println("[mDNS] ⚠️ Service mDNS arrêté, tentative de redémarrage...");
                if (MDNS.begin(MDNS_NAME)) {
                    Serial.println("[mDNS] ✅ Service redémarré avec succès");
                    MDNS.addService("http", "tcp", 80);
                } else {
                    Serial.println("[mDNS] ❌ Échec du redémarrage");
                }
            }
        }
    }
    
    // Maintenance du stockage
    storage.maintenance();
    
    // Gestion du bouton avec debounce amélioré
    static bool lastButtonState = HIGH;
    bool currentButtonState = digitalRead(buttonPin);
    
    if (currentButtonState != lastButtonState) {
        lastButtonPress = millis();
        lastButtonState = currentButtonState;
    }
    
    if (currentButtonState == LOW && (millis() - lastButtonPress > debounceDelay)) {
        handleButtonPress();
        delay(debounceDelay); // Attente supplémentaire pour éviter les doubles appuis
    }
    
    // Mise à jour de l'affichage
    updateDisplay();
    
    delay(1);
}

void setupWiFi() {
    Serial.println("[WiFi] Configuration du WiFiManager...");
    
    // Configuration avancée de WiFiManager
    wm.setAPCallback([](WiFiManager *myWiFiManager) {
        Serial.println("[WiFiManager] Portail Captif démarré");
        Serial.println("[WiFiManager] SSID: " + String(WIFI_AP_NAME));
        Serial.println("[WiFiManager] Mot de passe: " + String(WIFI_AP_PASSWORD));
        Serial.println("[WiFiManager] URL: http://192.168.4.1");
    });

    wm.setTimeout(WM_CONFIG_TIMEOUT);
    wm.setDebugOutput(true);

    Serial.println("[WiFi] Tentative de connexion...");
    bool res = wm.autoConnect(WIFI_AP_NAME, WIFI_AP_PASSWORD);
    
    if (!res) {
        Serial.println("[WiFi] ❌ Échec de connexion");
        Serial.println("[WiFi] Redémarrage...");
        delay(2000);
        ESP.restart();
    }

    // Gestion des événements Wi-Fi
    static WiFiEventHandler onConnectHandler = WiFi.onStationModeGotIP(onWiFiConnect);
    static WiFiEventHandler onDisconnectHandler = WiFi.onStationModeDisconnected(onWiFiDisconnect);
}

void onWiFiConnect(const WiFiEventStationModeGotIP& event) {
    digitalWrite(LED_WIFI, HIGH);
    Serial.println("=================================");
    Serial.println("[WiFi] ✅ Connecté !");
    Serial.println("[WiFi] IP: " + WiFi.localIP().toString());
    Serial.println("[WiFi] RSSI: " + String(WiFi.RSSI()) + " dBm");
    Serial.println("=================================");
    
    // Configuration mDNS
    Serial.println("[mDNS] Tentative de démarrage...");
    if (MDNS.begin(MDNS_NAME)) {
        Serial.println("[mDNS] ✅ Service démarré");
        Serial.println("[mDNS] URL: http://" + String(MDNS_NAME) + ".local");
        
        // Ajout des services
        MDNS.addService("http", "tcp", 80);
        Serial.println("[mDNS] Service HTTP ajouté");
        
        // Vérification de l'enregistrement
        if (MDNS.isRunning()) {
            Serial.println("[mDNS] ✅ Service en cours d'exécution");
            Serial.println("[mDNS] Nom d'hôte: " + String(MDNS_NAME) + ".local");
            Serial.println("[mDNS] IP: " + WiFi.localIP().toString());
        } else {
            Serial.println("[mDNS] ❌ Service non démarré");
        }
    } else {
        Serial.println("[mDNS] ❌ Erreur de démarrage");
        Serial.println("[mDNS] Vérifiez que votre réseau supporte mDNS");
        Serial.println("[mDNS] Vous pouvez toujours accéder via l'IP: " + WiFi.localIP().toString());
    }
}

void onWiFiDisconnect(const WiFiEventStationModeDisconnected& event) {
    digitalWrite(LED_WIFI, LOW);
    Serial.println("📴 Déconnecté du Wi-Fi !");
    Serial.println("Raison : " + String(event.reason));
}

void setupWebServer() {
    // Routes API
    server.on("/api/login", HTTP_POST, handleLogin);
    server.on("/api/queue", HTTP_GET, handleQueue);
    server.on("/api/next", HTTP_POST, handleNextClient);
    server.on("/api/test-status", HTTP_POST, handleTestStatus);
    server.on("/api/finish-visit", HTTP_POST, handleFinishVisit);
    server.on("/api/history", HTTP_GET, handleGetHistory);
    server.on("/api/export", HTTP_GET, handleExport);
    server.on("/api/export-all", HTTP_GET, handleExportAll);
    server.on("/api/technicians", HTTP_GET, handleGetTechnicians);
    server.on("/api/technicians", HTTP_POST, handleAddTechnician);
    server.on("/api/technicians", HTTP_DELETE, handleDeleteTechnician);
    
    // Route pour servir les fichiers statiques
    server.serveStatic("/", LittleFS, "/");
    
    server.begin();
}

void handleButtonPress() {
    if (isProcessing) return;
    isProcessing = true;
    
    // Incrémentation du numéro
    currentNumber = (currentNumber + 1) % 10000;  // Limite à 4 chiffres
    
    // Sauvegarde dans l'EEPROM
    EEPROM.write(0, currentNumber);
    EEPROM.commit();
    
    // Création de la nouvelle visite
    Visit newVisit;
    newVisit.number = currentNumber;
    strlcpy(newVisit.brakes, "OK", sizeof(newVisit.brakes));
    strlcpy(newVisit.alignment, "OK", sizeof(newVisit.alignment));
    strlcpy(newVisit.visual, "OK", sizeof(newVisit.visual));
    newVisit.timestamp = millis();
    
    // Sauvegarde dans le LittleFS
    if (storage.addVisit(newVisit)) {
        Serial.println("Visite enregistrée avec succès");
    } else {
        Serial.println("Erreur d'enregistrement de la visite");
    }
    
    // Mise à jour de l'affichage
    displayNumber(currentNumber);
    
    // Lecture du son
    myDFPlayer.play(1);
    
    // Mise à jour du statut
    currentStatus = "Nouveau client : " + String(currentNumber);
    lcd.clear();
    lcd.print(currentStatus);
    
    // Notification via WebSocket
    broadcastState();
    
    isProcessing = false;
}

void updateDisplay() {
    static unsigned long lastUpdate = 0;
    if (millis() - lastUpdate > 2) {
        lastUpdate = millis();
        
        // Multiplexage des afficheurs
        static bool digit = false;
        if (digit) {
            digitalWrite(DIGIT1_EN, HIGH);
            digitalWrite(DIGIT2_EN, LOW);
            displayDigit(currentNumber / 10);
        } else {
            digitalWrite(DIGIT1_EN, LOW);
            digitalWrite(DIGIT2_EN, HIGH);
            displayDigit(currentNumber % 10);
        }
        digit = !digit;
    }
}

void displayDigit(int digit) {
    // Conversion en BCD
    digitalWrite(BCD_A, digit & 0x01);
    digitalWrite(BCD_B, (digit >> 1) & 0x01);
    digitalWrite(BCD_C, (digit >> 2) & 0x01);
    digitalWrite(BCD_D, (digit >> 3) & 0x01);
}

void displayNumber(int number) {
    // Affichage sur les 7 segments
    int tens = number / 10;
    int ones = number % 10;
    
    digitalWrite(DIGIT1_EN, LOW);
    digitalWrite(DIGIT2_EN, HIGH);
    displayDigit(tens);
    delay(2);
    
    digitalWrite(DIGIT1_EN, HIGH);
    digitalWrite(DIGIT2_EN, LOW);
    displayDigit(ones);
    delay(2);
}

// Gestionnaires d'API
void handleLogin() {
    // À implémenter : vérification des identifiants
    server.send(200, "application/json", "{\"success\":true}");
}

void handleQueue() {
    StaticJsonDocument<1024> doc;
    JsonArray queue = doc.createNestedArray("queue");
    
    Serial.println("=================================");
    Serial.println("[Queue] Génération de la file d'attente");
    
    for (int i = 0; i < historyCount; i++) {
        // Un client est en attente si aucun test n'a été effectué
        if (history[i].brakes == "" && history[i].alignment == "" && history[i].visual == "") {
            JsonObject client = queue.createNestedObject();
            client["number"] = history[i].number;
            client["timestamp"] = history[i].timestamp;
            Serial.println("[Queue] Client #" + String(history[i].number) + " ajouté à la file");
        }
    }
    
    String response;
    serializeJson(doc, response);
    Serial.println("[Queue] " + String(queue.size()) + " clients dans la file");
    Serial.println("=================================");
    
    server.send(200, "application/json", response);
}

void handleNextClient() {
    if (!isProcessing) {
        isProcessing = true;
        // Jouer le fichier audio
        myDFPlayer.play(currentNumber);
        
        // Mettre à jour l'affichage LCD
        lcd.clear();
        lcd.print("Client #");
        lcd.print(currentNumber);
        lcd.print(" en cours");
        
        server.send(200, "application/json", "{\"success\":true}");
    } else {
        server.send(400, "application/json", "{\"error\":\"Un client est deja en cours\"}");
    }
}

void handleTestStatus() {
    String test = server.arg("test");
    String status = server.arg("status");
    
    Serial.println("=================================");
    Serial.println("[Test] Mise à jour du statut");
    Serial.println("[Test] Type: " + test);
    Serial.println("[Test] Statut: " + status);
    
    // Mettre à jour le statut du test
    bool found = false;
    for (int i = 0; i < historyCount; i++) {
        if (history[i].number == currentNumber) {
            found = true;
            if (test == "brakes") {
                history[i].brakes = status;
                Serial.println("[Test] Freinage mis à jour");
            }
            else if (test == "alignment") {
                history[i].alignment = status;
                Serial.println("[Test] Alignement mis à jour");
            }
            else if (test == "visual") {
                history[i].visual = status;
                Serial.println("[Test] Visuel mis à jour");
            }
            break;
        }
    }
    
    if (!found) {
        Serial.println("[Test] ❌ Client non trouvé");
    }
    
    // Mettre à jour l'affichage LCD
    lcd.clear();
    lcd.setCursor(0, 0);
    
    // Traduction des noms de tests en français
    String testName;
    if (test == "brakes") testName = "Freinage";
    else if (test == "alignment") testName = "Alignement";
    else if (test == "visual") testName = "Visuel";
    else testName = test;
    
    // Traduction des statuts en français
    String statusText;
    if (status == "pass") statusText = "OK";
    else if (status == "fail") statusText = "ECHEC";
    else statusText = status;
    
    // Affichage sur la première ligne
    lcd.print(testName + ": " + statusText);
    
    // Affichage du numéro de client sur la deuxième ligne
    lcd.setCursor(0, 1);
    lcd.print("Client #" + String(currentNumber));
    
    Serial.println("[LCD] Message mis à jour");
    Serial.println("=================================");
    
    server.send(200, "application/json", "{\"success\":true}");
}

void handleFinishVisit() {
    isProcessing = false;
    // Sonner le buzzer deux fois
    tone(10, 1000, 100);
    delay(200);
    tone(10, 1000, 100);
    
    // Message de fin
    lcd.clear();
    lcd.print("Merci d'etre");
    lcd.setCursor(0, 1);
    lcd.print("passe chez GTA");
    
    server.send(200, "application/json", "{\"success\":true}");
}

void handleGetHistory() {
    StaticJsonDocument<4096> doc;
    JsonArray array = doc.to<JsonArray>();
    
    Visit visit;
    for (uint16_t i = 0; i < storage.getVisitCount(); i++) {
        if (storage.getVisit(i, visit)) {
            JsonObject visitObj = array.createNestedObject();
            visitObj["number"] = visit.number;
            visitObj["brakes"] = visit.brakes;
            visitObj["alignment"] = visit.alignment;
            visitObj["visual"] = visit.visual;
            visitObj["timestamp"] = visit.timestamp;
        }
    }
    
    String response;
    serializeJson(doc, response);
    server.send(200, "application/json", response);
}

void handleExport() {
    // À implémenter : génération du PDF
    server.send(200, "application/pdf", "PDF content");
}

void handleExportAll() {
    // À implémenter : génération du PDF complet
    server.send(200, "application/pdf", "PDF content");
}

void handleGetTechnicians() {
    // À implémenter : liste des techniciens
    server.send(200, "application/json", "{\"technicians\":[]}");
}

void handleAddTechnician() {
    // À implémenter : ajout d'un technicien
    server.send(200, "application/json", "{\"success\":true}");
}

void handleDeleteTechnician() {
    // À implémenter : suppression d'un technicien
    server.send(200, "application/json", "{\"success\":true}");
} 
