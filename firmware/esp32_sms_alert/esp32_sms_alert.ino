/*
 * esp32_sms_alert.ino
 * ---------------------------------------------------------------------------
 * ESP32 -> EB Admin SMS alert reference firmware
 * ---------------------------------------------------------------------------
 *
 * STATUS: REFERENCE / NOT HARDWARE-VERIFIED.
 *   This sketch was written against the documented project contract but has
 *   NOT been compiled or flashed here (no ESP32 / toolchain in the dev
 *   environment). Treat it as a labelled reference implementation, not a
 *   proven binary. Compile & test it yourself before relying on it.
 *
 * WHAT IT DOES
 *   When a meter chip authentication FAILS, the ESP32 sends an authenticated
 *   HTTP POST to the backend:
 *
 *       POST {BACKEND_URL}/api/alerts/sms
 *       x-device-id:    {DEVICE_ID}
 *       x-device-token: {DEVICE_TOKEN}
 *       Content-Type:   application/json
 *       {
 *         "meterId":   "MTR-001",
 *         "status":    "FAILED",
 *         "reason":    "checksum mismatch",
 *         "eventId":   "INC-...",     // stable per incident (dedup)
 *         "eventTime": "..."          // optional; backend fills if absent
 *       }
 *
 *   The backend decides SIMULATION vs REAL_SMS. The ESP32 NEVER talks to an
 *   SMS provider directly and NEVER holds provider credentials.
 *
 * SAFETY
 *   This firmware only talks to the network. It does NOT control a relay or
 *   any electrical mains, and it makes no purchases or paid calls.
 *
 * CONFIGURATION
 *   Fill the constants below on the device (or better: provision them at
 *   build time). Do NOT commit real credentials to source control.
 * ---------------------------------------------------------------------------
 */

#include <WiFi.h>
#include <HTTPClient.h>

// ------------------------------- config -----------------------------------
static const char* WIFI_SSID     = "YOUR_WIFI_SSID";
static const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Backend base URL — no trailing slash. Use the LAN IP of the machine running
// `node server/src/smsServer.mjs` (localhost will NOT work from the ESP32).
static const char* BACKEND_URL   = "http://192.168.1.100:3001";

// Device credentials — must match DEVICE_ID / DEVICE_TOKEN on the backend.
static const char* DEVICE_ID     = "esp32-meter-001";
static const char* DEVICE_TOKEN  = "REPLACE_WITH_DEVICE_TOKEN";

// The meter this device reports for.
static const char* METER_ID      = "MTR-001";

// Button used to simulate a FAILED authentication for testing. GPIO0 is the
// BOOT button on most ESP32 dev boards.
#define TEST_TRIGGER_PIN 0

// ----------------------------- state --------------------------------------
static bool lastButtonState = HIGH;

void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("[wifi] connecting to %s ...\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[wifi] connected, IP=%s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[wifi] NOT connected — will retry on next event");
  }
}

// Minimal JSON string escaping for the values we send.
String jsonEscape(const String& in) {
  String out;
  out.reserve(in.length() + 8);
  for (size_t i = 0; i < in.length(); i++) {
    char c = in[i];
    if (c == '"' || c == '\\') {
      out += '\\';
      out += c;
    } else if (c == '\n') {
      out += "\\n";
    } else {
      out += c;
    }
  }
  return out;
}

// Build a stable per-incident id so the backend can deduplicate.
String makeIncidentId() {
  uint32_t r = esp_random();
  return String("INC-") + String(millis()) + "-" + String(r, HEX);
}

/**
 * Report one FAILED authentication to the backend.
 * @return true if the backend accepted the request.
 */
bool reportFailedAuth(const String& reason) {
  connectWiFi();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[alert] no Wi-Fi — NOT sending, NOT claiming success");
    return false;
  }

  String url = String(BACKEND_URL) + "/api/alerts/sms";
  String payload = String("{") +
    "\"meterId\":\""   + jsonEscape(String(METER_ID)) + "\"," +
    "\"status\":\"FAILED\"," +
    "\"reason\":\""    + jsonEscape(reason) + "\"," +
    "\"eventId\":\""   + makeIncidentId() + "\"" +
  "}";

  HTTPClient http;
  http.begin(url);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("x-device-token", DEVICE_TOKEN);

  int code = http.POST((uint8_t*)payload.c_str(), payload.length());
  if (code > 0) {
    String resp = http.getString();
    Serial.printf("[alert] HTTP %d: %s\n", code, resp.c_str());
  } else {
    Serial.printf("[alert] request failed: %s\n", http.errorToString(code).c_str());
  }
  http.end();
  return code >= 200 && code < 300;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  pinMode(TEST_TRIGGER_PIN, INPUT_PULLUP);
  Serial.println();
  Serial.println("ESP32 EB-Admin SMS alert reference firmware (NOT hardware-verified)");
  connectWiFi();
}

void loop() {
  // In real firmware the chip-authentication result would be produced by the
  // meter's verify routine. Here a button press stands in for a FAILED auth so
  // the path can be demonstrated without real theft or unsafe hardware.
  bool state = digitalRead(TEST_TRIGGER_PIN);
  if (lastButtonState == HIGH && state == LOW) {
    Serial.println("[sim] simulating a FAILED chip authentication");
    reportFailedAuth("simulated chip authentication failure");
  }
  lastButtonState = state;
  delay(50);
}
