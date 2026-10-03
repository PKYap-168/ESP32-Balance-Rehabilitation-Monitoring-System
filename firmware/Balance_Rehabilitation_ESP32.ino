#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "HX711.h"
#include <HardwareSerial.h>

// =====================================================
// WIFI
// =====================================================
const char* ssid = "Your_WiFi_Name";
const char* password = "Your_WiFi_Password";

// Lightweight local web server
WebServer server(80);

// =====================================================
// SESSION CONTROL
// =====================================================
bool sessionRunning = false;

// =====================================================
// LIVE DATA SHARED WITH WEBSITE
// =====================================================
float currentLeftKg = 0.0;
float currentRightKg = 0.0;
float currentTotalKg = 0.0;

float currentLeftPercent = 0.0;
float currentRightPercent = 0.0;

String currentStatus = "NO USER";

// =====================================================
// OLED
// =====================================================
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1

#define OLED_SDA 21
#define OLED_SCL 22

Adafruit_SSD1306 display(
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  &Wire,
  OLED_RESET
);

// =====================================================
// ACTIVITY / SLEEP SETTINGS
// =====================================================

// User considered present above this weight
const float USER_ON_THRESHOLD = 5.0;

// Platform considered empty below this weight
const float EMPTY_THRESHOLD = 2.0;

// Empty must persist this long before auto-tare
const unsigned long EMPTY_CONFIRM_TIME = 5000;

// OLED sleeps after 60 seconds without user
const unsigned long SLEEP_DELAY = 60000;

// Show countdown during final 10 seconds
const unsigned long SLEEP_WARNING_TIME = 10000;

// Web update timing
unsigned long lastSensorUpdate = 0;
const unsigned long SENSOR_INTERVAL = 250;

enum PlatformState {
  IDLE,
  USER_ON,
  WAITING_EMPTY,
  SLEEPING
};

PlatformState platformState = IDLE;

unsigned long emptyStartTime = 0;
unsigned long idleStartTime = 0;

bool displaySleeping = false;
bool showingSleepCountdown = false;

// =====================================================
// HX711 LEFT
// =====================================================
#define LEFT_DT 25
#define LEFT_SCK 14

// =====================================================
// HX711 RIGHT
// =====================================================
#define RIGHT_DT 27
#define RIGHT_SCK 26

HX711 leftScale;
HX711 rightScale;

// Calibration factors
float LEFT_CAL = -45580.0;
float RIGHT_CAL = -41675.0;

// Ignore very small residual readings
const float ZERO_DEADBAND = 0.25;

// =====================================================
// DFPLAYER MINI - ONE-WAY UART
// =====================================================
// Proven working hardware connection:
// ESP32 GPIO17 -> 1k resistor -> DFPlayer RX
// DFPlayer TX is intentionally NOT connected.
#define DFPLAYER_TX_PIN 17

HardwareSerial dfSerial(2);

// Audio timing / anti-repeat
unsigned long lastAudioTime = 0;
const unsigned long AUDIO_COOLDOWN = 4000;

String previousAudioStatus = "NO USER";

// Prevent repeated one-time prompt
bool patientDetectedAudioPlayed = false;
bool sleepWarningAudioPlayed = false;

// Delayed prompts so voice files do not overlap
bool pendingStepOnPrompt = false;
unsigned long pendingStepOnTime = 0;

bool pendingStepOffPrompt = false;
unsigned long pendingStepOffTime = 0;

// =====================================================
// RAW DFPLAYER COMMANDS
// =====================================================
void sendDFCommand(uint8_t command, uint16_t parameter) {

  uint8_t paramHigh = (parameter >> 8) & 0xFF;
  uint8_t paramLow = parameter & 0xFF;
  uint8_t ack = 0x00;

  uint16_t checksum =
    0 - (
      0xFF +
      0x06 +
      command +
      ack +
      paramHigh +
      paramLow
    );

  uint8_t packet[10] = {
    0x7E,
    0xFF,
    0x06,
    command,
    ack,
    paramHigh,
    paramLow,
    (uint8_t)(checksum >> 8),
    (uint8_t)(checksum & 0xFF),
    0xEF
  };

  dfSerial.write(packet, 10);
  dfSerial.flush();
}

void setDFVolume(uint8_t volume) {

  if (volume > 30) {
    volume = 30;
  }

  sendDFCommand(0x06, volume);
}

void playAudio(uint16_t track) {

  sendDFCommand(0x12, track);

  lastAudioTime = millis();

  Serial.print("Playing audio track: ");
  Serial.println(track);
}

// =====================================================
// CORS
// Allows website running through Live Server to talk
// directly to ESP32
// =====================================================
void addCors() {
  server.sendHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  server.sendHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  server.sendHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );
}

// =====================================================
// API: GET /data
//
// Website requests:
// http://ESP32_IP/data
//
// ESP32 returns latest physical readings as JSON.
// =====================================================
void handleData() {

  char json[320];

  snprintf(
    json,
    sizeof(json),

    "{"
      "\"leftKg\":%.2f,"
      "\"rightKg\":%.2f,"
      "\"totalKg\":%.2f,"
      "\"leftPercent\":%.1f,"
      "\"rightPercent\":%.1f,"
      "\"status\":\"%s\","
      "\"sessionRunning\":%s,"
      "\"platformState\":%d"
    "}",

    currentLeftKg,
    currentRightKg,
    currentTotalKg,
    currentLeftPercent,
    currentRightPercent,
    currentStatus.c_str(),
    sessionRunning ? "true" : "false",
    (int)platformState
  );

  addCors();

  server.send(
    200,
    "application/json",
    json
  );
}

// =====================================================
// API: POST /start
// =====================================================
void handleStart() {

  // Ignore repeated START requests while already running
  if (!sessionRunning) {
    sessionRunning = true;

    // 0009.mp3 = "Session started. Maintain your balance."
    playAudio(9);

    // 0002.mp3 = "Please step onto the platform"
    // Give track 1 time to finish first.
    pendingStepOnPrompt = false;
    //pendingStepOnTime = millis() + 2500;

    pendingStepOffPrompt = false;
    previousAudioStatus = "NO USER";
  }

  Serial.println();
  Serial.println(
    "Session START command received from website."
  );

  addCors();

  server.send(
    200,
    "text/plain",
    "STARTED"
  );
}

// =====================================================
// API: POST /stop
// =====================================================
void handleStop() {

  // Only trigger completion audio when a running session is stopped
  if (sessionRunning) {
    sessionRunning = false;

    pendingStepOnPrompt = false;

    // 0007.mp3 = "Session completed"
    playAudio(7);

    // 0011.mp3 = "Please step off the platform carefully."
    pendingStepOffPrompt = true;
    pendingStepOffTime = millis() + 2500;

    previousAudioStatus = "NO USER";
  }

  Serial.println();
  Serial.println(
    "Session STOP command received from website."
  );

  addCors();

  server.send(
    200,
    "text/plain",
    "STOPPED"
  );
}

// =====================================================
// API: POST /calibrate
//
// IMPORTANT:
// Tare is rejected if someone is standing on platform.
// =====================================================
void handleCalibrate() {

  Serial.println();
  Serial.println(
    "Calibration command received from website."
  );

  if (currentTotalKg <= EMPTY_THRESHOLD) {

    Serial.println(
      "Platform empty. Remote tare starting..."
    );

    // Inform local user
    if (!displaySleeping) {

      display.clearDisplay();
      display.setTextColor(SSD1306_WHITE);
      display.setTextSize(1);

      display.setCursor(25, 18);
      display.println("CALIBRATING");

      display.setCursor(20, 38);
      display.println("Please wait...");

      display.display();
    }

    leftScale.tare(20);
    rightScale.tare(20);

    currentLeftKg = 0.0;
    currentRightKg = 0.0;
    currentTotalKg = 0.0;

    currentLeftPercent = 0.0;
    currentRightPercent = 0.0;

    currentStatus = "NO USER";

    idleStartTime = millis();
    platformState = IDLE;
    sleepWarningAudioPlayed = false;

    Serial.println(
      "Remote tare completed."
    );

    addCors();

    server.send(
      200,
      "text/plain",
      "CALIBRATED"
    );
  }

  else {

    Serial.println(
      "Tare rejected: platform is not empty."
    );

    addCors();

    server.send(
      409,
      "text/plain",
      "PLATFORM_NOT_EMPTY"
    );
  }
}

// =====================================================
// Handle browser OPTIONS request
// =====================================================
void handleOptions() {

  addCors();

  server.send(
    204,
    "text/plain",
    ""
  );
}

// =====================================================
// SETUP
// =====================================================
void setup() {

  Serial.begin(115200);
  delay(1000);

  // ===================================================
  // DFPLAYER MINI - ONE-WAY UART
  // ===================================================
  dfSerial.begin(
    9600,
    SERIAL_8N1,
    -1,                 // RX unused
    DFPLAYER_TX_PIN     // TX = GPIO17
  );

  // Allow DFPlayer / SD card to initialize
  delay(2000);

  // Volume range 0-30. Start moderate for 4 ohm 3 W speaker.
  setDFVolume(22);

  Serial.println(
    "DFPlayer one-way UART initialized."
  );

  // ===================================================
  // WIFI
  // ===================================================
  WiFi.begin(
    ssid,
    password
  );

  Serial.print(
    "Connecting to WiFi"
  );

  while (
    WiFi.status() != WL_CONNECTED
  ) {

    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.println(
    "WiFi connected!"
  );

  Serial.print(
    "ESP32 IP: "
  );

  Serial.println(
    WiFi.localIP()
  );

  // ===================================================
  // LOCAL API
  // ===================================================

  server.on(
    "/data",
    HTTP_GET,
    handleData
  );

  server.on(
    "/start",
    HTTP_POST,
    handleStart
  );

  server.on(
    "/stop",
    HTTP_POST,
    handleStop
  );

  server.on(
    "/calibrate",
    HTTP_POST,
    handleCalibrate
  );

  // CORS preflight
  server.on(
    "/data",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/start",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/stop",
    HTTP_OPTIONS,
    handleOptions
  );

  server.on(
    "/calibrate",
    HTTP_OPTIONS,
    handleOptions
  );

  server.begin();

  Serial.println(
    "Local API server started."
  );

  // ===================================================
  // OLED
  // ===================================================
  Wire.begin(
    OLED_SDA,
    OLED_SCL
  );

  if (
    !display.begin(
      SSD1306_SWITCHCAPVCC,
      0x3C
    )
  ) {

    Serial.println(
      "OLED initialization failed!"
    );

    while (true) {
      delay(1000);
    }
  }

  display.clearDisplay();
  display.setTextColor(
    SSD1306_WHITE
  );

  display.setTextSize(1);
  display.setCursor(15, 10);
  display.println(
    "Balance Platform"
  );

  display.setCursor(25, 30);
  display.println(
    "Starting..."
  );

  display.display();

  // ===================================================
  // HX711
  // ===================================================
  leftScale.begin(
    LEFT_DT,
    LEFT_SCK
  );

  rightScale.begin(
    RIGHT_DT,
    RIGHT_SCK
  );

  leftScale.set_scale(
    LEFT_CAL
  );

  rightScale.set_scale(
    RIGHT_CAL
  );

  delay(1000);

  // ===================================================
  // INITIAL TARE
  // ===================================================
  display.clearDisplay();
  display.setTextSize(1);

  display.setCursor(15, 15);
  display.println(
    "Remove all weight"
  );

  display.setCursor(35, 35);
  display.println(
    "Taring..."
  );

  display.display();

  Serial.println();
  Serial.println(
    "Remove all weight."
  );

  Serial.println(
    "Taring in 5 seconds..."
  );

  delay(5000);

  leftScale.tare(20);
  rightScale.tare(20);

  idleStartTime = millis();
  platformState = IDLE;

  Serial.println(
    "Platform ready!"
  );

  display.clearDisplay();
  display.setTextSize(2);

  display.setCursor(35, 25);
  display.println(
    "READY"
  );

  display.display();

  // 0012.mp3 = "Balance rehabilitation platform ready."
  playAudio(12);

  delay(1500);
}

// =====================================================
// LOOP
// =====================================================
void loop() {

  // Handle any request from website
  server.handleClient();

  // ===================================================
  // SCHEDULED AUDIO PROMPTS
  // ===================================================
  unsigned long audioNow = millis();

  if (
    pendingStepOnPrompt &&
    (long)(audioNow - pendingStepOnTime) >= 0
  ) {
    pendingStepOnPrompt = false;

    // 0002.mp3 = "Please step onto the platform"
    playAudio(2);
  }

  if (
    pendingStepOffPrompt &&
    (long)(audioNow - pendingStepOffTime) >= 0
  ) {
    pendingStepOffPrompt = false;

    // 0011.mp3 = "Please step off the platform carefully."
    playAudio(11);
  }

  unsigned long now = millis();

  // Only run sensor/display logic every 250 ms.
  // Do not return early here; loop() should always reach delay(1)
  // so Wi-Fi and ESP32 system tasks get CPU time.
  if (now - lastSensorUpdate >= SENSOR_INTERVAL) {

    lastSensorUpdate = now;

    showingSleepCountdown = false;

  // ===================================================
  // CHECK HX711
  // ===================================================
  // Non-blocking check: if either converter has no fresh reading,
  // skip only this sensor-update cycle.
  if (
    !leftScale.is_ready() ||
    !rightScale.is_ready()
  ) {
    delay(1);  // yield to Wi-Fi/system tasks
    return;
  }

  // ===================================================
  // READ WEIGHT
  // ===================================================
  float leftKg =
    leftScale.get_units(3);

  float rightKg =
    rightScale.get_units(3);

  // Zero deadband
  if (
    fabs(leftKg) <
    ZERO_DEADBAND
  ) {

    leftKg = 0.0;
  }

  if (
    fabs(rightKg) <
    ZERO_DEADBAND
  ) {

    rightKg = 0.0;
  }

  // Do not allow negative weights
  if (leftKg < 0) {
    leftKg = 0.0;
  }

  if (rightKg < 0) {
    rightKg = 0.0;
  }

  float totalKg =
    leftKg + rightKg;

  // ===================================================
  // BALANCE CALCULATION
  // ===================================================
  float leftPercent = 0.0;
  float rightPercent = 0.0;

  String status =
    "NO USER";

  if (totalKg > 1.0) {

    leftPercent =
      (leftKg / totalKg) *
      100.0;

    rightPercent =
      (rightKg / totalKg) *
      100.0;

    // Balanced region: 45%-55%
    if (
      leftPercent >= 45.0 &&
      leftPercent <= 55.0
    ) {

      status =
        "BALANCED";
    }

    else if (
      leftPercent > 55.0
    ) {

      status =
        "LEAN LEFT";
    }

    else {

      status =
        "LEAN RIGHT";
    }
  }

  // ===================================================
  // STORE LATEST VALUES FOR WEBSITE
  // ===================================================
  currentLeftKg =
    leftKg;

  currentRightKg =
    rightKg;

  currentTotalKg =
    totalKg;

  currentLeftPercent =
    leftPercent;

  currentRightPercent =
    rightPercent;

  currentStatus =
    status;

  // ===================================================
  // AUDIO BALANCE FEEDBACK
  // ===================================================
  // Only provide coaching during an active session.
  // Trigger on state changes rather than every 250 ms.
  if (
    sessionRunning &&
    status != previousAudioStatus &&
    millis() - lastAudioTime >= AUDIO_COOLDOWN
  ) {

    if (status == "BALANCED") {

      // 0010.mp3 = "Good! Balance maintained"
      playAudio(10);
    }

    else if (status == "LEAN LEFT") {

      // Too much weight on the LEFT:
      // 0005.mp3 = "Please shift your weight to the right"
      playAudio(5);
    }

    else if (status == "LEAN RIGHT") {

      // Too much weight on the RIGHT:
      // 0004.mp3 = "Please shift your weight to the left"
      playAudio(4);
    }

    previousAudioStatus = status;
  }

  // ===================================================
  // PLATFORM STATE MACHINE
  // ===================================================
  switch (platformState) {

    // =================================================
    // IDLE
    // =================================================
    case IDLE: {

      unsigned long idleElapsed =
        millis() -
        idleStartTime;

      // User steps on
      if (
        totalKg >=
        USER_ON_THRESHOLD
      ) {

        platformState =
          USER_ON;

        if (displaySleeping) {

          display.ssd1306_command(
            SSD1306_DISPLAYON
          );

          displaySleeping =
            false;
        }

        // 0013.mp3 = "Patient detected. Please stand still."
        if (!patientDetectedAudioPlayed) {
          playAudio(13);
          patientDetectedAudioPlayed = true;
        }

        // Cancel/reset sleep warning for next inactivity cycle
        sleepWarningAudioPlayed = false;

        Serial.println(
          "User detected."
        );
      }

      // Last 10 seconds before sleep
      else if (
        idleElapsed >=
          (SLEEP_DELAY -
           SLEEP_WARNING_TIME) &&
        idleElapsed <
          SLEEP_DELAY
      ) {

        if (!sleepWarningAudioPlayed) {
          // 0014.mp3 = "Platform inactive. Entering sleep mode in 10 seconds."
          playAudio(14);
          sleepWarningAudioPlayed = true;
        }

        unsigned long remaining =
          (
            SLEEP_DELAY -
            idleElapsed +
            999
          ) / 1000;

        showingSleepCountdown =
          true;

        if (!displaySleeping) {

          display.clearDisplay();

          display.setTextColor(
            SSD1306_WHITE
          );

          display.setTextSize(1);

          display.setCursor(
            22,
            15
          );

          display.println(
            "No activity"
          );

          display.setCursor(
            10,
            35
          );

          display.print(
            "Sleeping in "
          );

          display.print(
            remaining
          );

          display.println(
            " sec"
          );

          display.display();
        }
      }

      // Enter OLED sleep
      else if (
        idleElapsed >=
        SLEEP_DELAY
      ) {

        // 0015.mp3 = "Entering sleep mmode."
        playAudio(15);
        delay(300);

        display.clearDisplay();
        display.display();

        display.ssd1306_command(
          SSD1306_DISPLAYOFF
        );

        displaySleeping =
          true;

        platformState =
          SLEEPING;

        Serial.println(
          "OLED sleeping..."
        );
      }

      break;
    }

    // =================================================
    // USER ON PLATFORM
    // =================================================
    case USER_ON:

      if (
        totalKg <=
        EMPTY_THRESHOLD
      ) {

        emptyStartTime =
          millis();

        platformState =
          WAITING_EMPTY;

        Serial.println(
          "Possible user exit..."
        );
      }

      break;

    // =================================================
    // WAITING EMPTY
    // =================================================
    case WAITING_EMPTY:

      // User stepped back on
      if (
        totalKg >=
        USER_ON_THRESHOLD
      ) {

        platformState =
          USER_ON;

        Serial.println(
          "User returned."
        );
      }

      // Still empty
      else if (
        totalKg <=
        EMPTY_THRESHOLD
      ) {

        if (
          millis() -
            emptyStartTime >=
          EMPTY_CONFIRM_TIME
        ) {

          patientDetectedAudioPlayed = false;

          Serial.println(
            "Platform empty."
          );

          Serial.println(
            "Auto-taring..."
          );

          if (!displaySleeping) {

            display.clearDisplay();
            display.setTextSize(1);

            display.setCursor(
              20,
              20
            );

            display.println(
              "Platform empty"
            );

            display.setCursor(
              25,
              38
            );

            display.println(
              "Re-zeroing..."
            );

            display.display();
          }

          leftScale.tare(20);
          rightScale.tare(20);

          Serial.println(
            "Tare complete."
          );

          idleStartTime =
            millis();

          platformState =
            IDLE;
        }
      }

      // Weight between thresholds
      else {

        emptyStartTime =
          millis();
      }

      break;

    // =================================================
    // OLED SLEEPING
    // =================================================
    case SLEEPING:

      if (
        totalKg >=
        USER_ON_THRESHOLD
      ) {

        display.ssd1306_command(
          SSD1306_DISPLAYON
        );

        displaySleeping =
          false;

        platformState =
          USER_ON;
        
        sleepWarningAudioPlayed = false;

        if (!patientDetectedAudioPlayed) {
          // 0013.mp3 = "Patient detected. Please stand still."
          playAudio(13);
          patientDetectedAudioPlayed = true;
        }

        Serial.println(
          "User detected - OLED awake."
        );
      }

      break;
  }

  // ===================================================
  // SERIAL OUTPUT
  // ===================================================
  Serial.print(
    "LEFT: "
  );

  Serial.print(
    leftKg,
    2
  );

  Serial.print(
    " kg"
  );

  Serial.print(
    " | RIGHT: "
  );

  Serial.print(
    rightKg,
    2
  );

  Serial.print(
    " kg"
  );

  Serial.print(
    " | TOTAL: "
  );

  Serial.print(
    totalKg,
    2
  );

  Serial.print(
    " kg"
  );

  if (totalKg > 1.0) {

    Serial.print(
      " | L: "
    );

    Serial.print(
      leftPercent,
      1
    );

    Serial.print("%");

    Serial.print(
      " R: "
    );

    Serial.print(
      rightPercent,
      1
    );

    Serial.print("%");
  }

  Serial.print(
    " | "
  );

  Serial.print(
    status
  );

  Serial.print(
    " | SESSION: "
  );

  Serial.println(
    sessionRunning
      ? "RUNNING"
      : "STOPPED"
  );

  // ===================================================
  // NORMAL OLED UPDATE
  // ===================================================
  if (
    !displaySleeping &&
    !showingSleepCountdown
  ) {

    display.clearDisplay();

    display.setTextColor(
      SSD1306_WHITE
    );

    display.setTextSize(1);

    // Left weight
    display.setCursor(
      0,
      0
    );

    display.print("L:");
    display.print(
      leftKg,
      1
    );

    display.print("kg");

    // Right weight
    display.setCursor(
      68,
      0
    );

    display.print("R:");

    display.print(
      rightKg,
      1
    );

    display.print("kg");

    // Total
    display.setCursor(
      0,
      16
    );

    display.print(
      "Total: "
    );

    display.print(
      totalKg,
      1
    );

    display.print(
      " kg"
    );

    // Percentages
    display.setCursor(
      0,
      32
    );

    if (totalKg > 1.0) {

      display.print("L:");

      display.print(
        leftPercent,
        0
      );

      display.print("%");

      display.setCursor(
        68,
        32
      );

      display.print("R:");

      display.print(
        rightPercent,
        0
      );

      display.print("%");
    }

    else {

      display.print(
        "Waiting..."
      );
    }

    // Status
    display.setCursor(
      28,
      52
    );

    display.print(
      status
    );

    display.display();
  }

  static unsigned long lastMemoryCheck = 0;
  
  if (millis() - lastMemoryCheck >= 5000) {
    lastMemoryCheck = millis();

    Serial.print("Free heap: ");
    Serial.print(ESP.getFreeHeap());

    Serial.print(" | Min free heap: ");
    Serial.println(ESP.getMinFreeHeap());
  }

  } // end timed sensor/display update

  // Yield briefly on every pass through loop().
  // This keeps WebServer/Wi-Fi responsive without the old 500 ms block.
  delay(1);
}
