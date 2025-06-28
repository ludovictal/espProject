#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include "FS.h"
#include "LittleFS.h"
#include <ESPmDNS.h>    
#include <WiFiManager.h> 

#define FORMAT_LITTLEFS_IF_FAILED true

#define SECRET_KEY "gta456"
#define WIFI_TIMEOUT 30 // Timeout WiFi en secondes


// Serveur HTTP sur le port 80
WebServer server(80);

//  Fonction générique pour servir les fichiers (html, css, js)
void handleFileRequest() {
  String path = server.uri();
  if (path == "/") path = "/index.html";

  String contentType = "text/plain";
  if (path.endsWith(".html")) contentType = "text/html";
  else if (path.endsWith(".css")) contentType = "text/css";
  else if (path.endsWith(".js")) contentType = "application/javascript";
  else if (path.endsWith(".png")) contentType = "image/png";
  else if (path.endsWith(".jpg") || path.endsWith(".jpeg")) contentType = "image/jpeg";
  else if (path.endsWith(".ico")) contentType = "image/x-icon";

  if (LittleFS.exists(path)) {
    File file = LittleFS.open(path, "r");
    server.streamFile(file, contentType);
    file.close();
  } else {
    server.send(404, "text/plain", "Fichier non trouvé");
  }
}

void setup() {
  Serial.begin(115200);

  //  Initialisation de LittleFS
  if (!LittleFS.begin(FORMAT_LITTLEFS_IF_FAILED)) {
    Serial.println("Erreur : échec du montage de LittleFS");
    return;
  }
  Serial.println("LittleFS monté avec succès");

  //  Configuration WiFi avec WiFiManager
  WiFiManager wifiManager;
  wifiManager.setDebugOutput(true);  // Active les logs de débogage
  wifiManager.setConnectTimeout(WIFI_TIMEOUT); // Timeout de connexion

  // Tentative de connexion WiFi
  Serial.println("Connexion WiFi en cours...");
  if (!wifiManager.autoConnect("GTA-connect")) {
    Serial.println("Échec de la connexion WiFi - Redémarrage...");
    delay(1000);
    ESP.restart(); // Redémarrage propre en cas d'échec
  }

  // Connexion réussie
  Serial.print("Connecté au WiFi. Adresse IP: ");
  Serial.println(WiFi.localIP());

  // Nom de domaine local
  if (!MDNS.begin("gta")) {
    Serial.println("Erreur lors du démarrage mDNS!");
  } else {
    Serial.println("mDNS démarré: http://gta.local");
  }


  //  Gestion des routes
  server.onNotFound(handleFileRequest);

  server.begin();
  Serial.println("Serveur HTTP démarré");
}

void loop() {
  server.handleClient();

}
