#include <wifi.h>
#include <ESPAsyncWebServer.h>
#include <SPIFFS.h>

const char* ssid = "CLUB TECHNOLOGIE"; // Remplacez par le nom de votre réseau Wi-Fi
const char* password = "GETEc2024"; // Remplacez par le mot de passe de votre réseau Wi-Fi

WebServer server(80); // Crée un serveur web sur le port 80 (HTTP standard)


void handleRoot() {
  File file = SPIFFS.open("/index.html", "r");
  if (!file) {
    server.send(500, "text/plain", "Erreur: Fichier index.html non trouvé");
    return;
  }
  server.streamFile(file, "text/html");
  file.close();
}

void setup() {
  Serial.begin(115200);

  // Connexion Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Connexion au Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connecté !");
  Serial.print("Adresse IP : ");
  Serial.println(WiFi.localIP());

  // Initialisation SPIFFS
  if (!SPIFFS.begin(true)) {
    Serial.println("Erreur de montage SPIFFS");
    return;
  }

  // Gérer les fichiers statiques (JS, images, autres pages HTML)
  server.serveStatic("/", SPIFFS, "/");

  // Gérer la racine (page d'accueil)
  server.on("/", handleRoot);

  server.begin();
  Serial.println("Serveur démarré");
}

void loop() {
  server.handleClient();
}