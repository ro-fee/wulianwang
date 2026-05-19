#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <BLEClient.h>
#include <BLE2902.h>
#include <HardwareSerial.h>
#include <math.h>

// #define LEFT // 根据实际硬件定义LEFT/RIGHT
#define RIGHT

static const char *WEB_BLE_SERVICE_UUID = "12345678-1234-1234-1234-1234567890ab";
static const char *WEB_BLE_DATA_CHAR_UUID = "abcd1234-1234-1234-1234-abcdef123456";
static const size_t BLE_NOTIFY_CHUNK_SIZE = 20;
static const size_t RGC_PACKET_SIZE = 56;
static const uint8_t RGC_PACKET_VERSION = 1;
static const uint8_t RGC_PAYLOAD_LENGTH = 48;
static const unsigned long BLE_NOTIFY_INTERVAL_MS = 30;

#ifdef LEFT
static const char *WEB_BLE_DEVICE_NAME = "RGC-BLE-LEFT";
static BLEAddress targetAddress("FF:24:08:20:53:BD"); // 左足
#else
static const char *WEB_BLE_DEVICE_NAME = "RGC-BLE-RIGHT";
static BLEAddress targetAddress("FF:23:10:16:02:EA"); // 右足
#endif

static BLEUUID sensorServiceUUID("0000fff0-0000-1000-8000-00805f9b34fb");
static BLEUUID sensorNotifyUUID("0000fff1-0000-1000-8000-00805f9b34fb");

BLEClient *pClient = nullptr;
BLERemoteCharacteristic *pNotifyCharacteristic = nullptr;
BLEServer *pWebServer = nullptr;
BLECharacteristic *pWebDataCharacteristic = nullptr;
bool webBleConnected = false;

const size_t BUFFER_SIZE = 100;
uint8_t rx_buffer[BUFFER_SIZE];
size_t rx_index = 0;

const size_t PRESSURE_ARRAY_SIZE = 18;
uint16_t pressure[PRESSURE_ARRAY_SIZE];
float AnglePressure[24] = {0};

struct ImuData
{
  float roll, pitch, yaw;
  bool newData;
};

HardwareSerial upperArmSerial(1);
ImuData upperArmData = {0.0, 0.0, 0.0, false};
static int state1 = 0, bufferIndex1 = 0;
static uint8_t buffer1[11];

HardwareSerial lowerArmSerial(2);
ImuData lowerArmData = {0.0, 0.0, 0.0, false};
static int state2 = 0, bufferIndex2 = 0;
static uint8_t buffer2[11];

float zero_error_roll_upper = 0.0;
float zero_error_pitch_upper = 0.0;
float zero_error_yaw_upper = 0.0;
float zero_error_roll_lower = 0.0;
float zero_error_pitch_lower = 0.0;
float zero_error_yaw_lower = 0.0;
float sum_roll_upper = 0.0, sum_pitch_upper = 0.0, sum_yaw_upper = 0.0;
float sum_roll_lower = 0.0, sum_pitch_lower = 0.0, sum_yaw_lower = 0.0;
int sample_count = 10;
unsigned long lastBleNotifyMs = 0;
uint16_t webBleSequence = 0;

class WebBleServerCallbacks : public BLEServerCallbacks
{
  void onConnect(BLEServer *server)
  {
    webBleConnected = true;
    Serial.println("Web BLE client connected.");
  }

  void onDisconnect(BLEServer *server)
  {
    webBleConnected = false;
    Serial.println("Web BLE client disconnected. Advertising restarted.");
    server->getAdvertising()->start();
  }
};

class WebBleCommandCallbacks : public BLECharacteristicCallbacks
{
  void onWrite(BLECharacteristic *characteristic)
  {
    String command = characteristic->getValue().c_str();
    command.trim();
    command.toUpperCase();

    if (command == "RESET" || command == "RESTART")
    {
      Serial.println("Reset command received from BLE bridge.");
      delay(100);
      ESP.restart();
      return;
    }

    Serial.printf("Unknown BLE command: %s\n", command.c_str());
  }
};

void notifyCallback(BLERemoteCharacteristic *pBLERemoteCharacteristic, uint8_t *pData, size_t length, bool isNotify)
{
  for (size_t i = 0; i < length; ++i)
  {
    if (rx_index < BUFFER_SIZE)
      rx_buffer[rx_index++] = pData[i];
    else
    {
      rx_index = 0;
      Serial.println("Buffer overflow!");
    }
  }

  while (rx_index >= 39)
  {
    if (rx_buffer[0] != 0xAA)
    {
      memmove(rx_buffer, rx_buffer + 1, rx_index - 1);
      rx_index--;
      continue;
    }

    uint8_t calcSum = 0;
    for (size_t i = 0; i < 38; ++i)
      calcSum += rx_buffer[i];
    if (calcSum != rx_buffer[38])
    {
      memmove(rx_buffer, rx_buffer + 1, rx_index - 1);
      rx_index--;
      continue;
    }

    for (size_t i = 0; i < PRESSURE_ARRAY_SIZE; ++i)
    {
      pressure[i] = (rx_buffer[2 + 2 * i] << 8) | rx_buffer[3 + 2 * i];
      AnglePressure[6 + i] = pressure[i];
    }

    memmove(rx_buffer, rx_buffer + 39, rx_index - 39);
    rx_index -= 39;
  }
}

void reconnectSensorBle()
{
  Serial.println("Reconnecting sensor BLE...");
  if (pClient)
  {
    pClient->disconnect();
    delete pClient;
    pClient = nullptr;
  }

  pClient = BLEDevice::createClient();
  if (pClient->connect(targetAddress))
  {
    Serial.println("Sensor BLE reconnected.");
    BLERemoteService *pSvc = pClient->getService(sensorServiceUUID);
    if (pSvc)
    {
      pNotifyCharacteristic = pSvc->getCharacteristic(sensorNotifyUUID);
      if (pNotifyCharacteristic && pNotifyCharacteristic->canNotify())
      {
        pNotifyCharacteristic->registerForNotify(notifyCallback);
        Serial.println("Sensor BLE notify registered.");
      }
    }
  }
  else
  {
    Serial.println("Sensor BLE reconnect failed!");
  }
}

void processSensor(HardwareSerial &serial, int &state, int &bufferIndex,
                   uint8_t buffer[], ImuData &imuData, const char *name)
{
  while (serial.available())
  {
    uint8_t byte = serial.read();

    if (state == 0)
    {
      if (byte == 0x55)
      {
        buffer[0] = byte;
        state = 1;
      }
    }
    else if (state == 1)
    {
      if (byte == 0x53)
      {
        buffer[1] = byte;
        state = 2;
        bufferIndex = 2;
      }
      else
        state = 0;
    }
    else if (state == 2)
    {
      buffer[bufferIndex++] = byte;
      if (bufferIndex == 11)
      {
        uint8_t sum = 0;
        for (int i = 0; i < 10; ++i)
          sum += buffer[i];
        if (sum == buffer[10])
        {
          int16_t rollRaw = (buffer[3] << 8) | buffer[2];
          int16_t pitchRaw = (buffer[5] << 8) | buffer[4];
          int16_t yawRaw = (buffer[7] << 8) | buffer[6];

          imuData.roll = rollRaw / 32768.0 * 180.0;
          imuData.pitch = pitchRaw / 32768.0 * 180.0;
          imuData.yaw = yawRaw / 32768.0 * 180.0;
          imuData.newData = true;
        }
        else
        {
          Serial.printf("%s IMU checksum error!\n", name);
        }
        state = 0;
        bufferIndex = 0;
      }
    }
  }
}

void normalizeAnglePressure()
{
  AnglePressure[0] = upperArmData.roll - zero_error_roll_upper;
  AnglePressure[1] = upperArmData.pitch - zero_error_pitch_upper;
  AnglePressure[2] = upperArmData.yaw - zero_error_yaw_upper;
  AnglePressure[3] = lowerArmData.roll - zero_error_roll_lower;
  AnglePressure[4] = lowerArmData.pitch - zero_error_pitch_lower;
  AnglePressure[5] = lowerArmData.yaw - zero_error_yaw_lower;

  for (int i = 0; i < 6; i++)
  {
    if (i == 1 || i == 4)
      continue;

    AnglePressure[i] = fmod(AnglePressure[i], 360.0);
    if (AnglePressure[i] > 180)
      AnglePressure[i] -= 360;
    else if (AnglePressure[i] < -180)
      AnglePressure[i] += 360;
  }

  for (int i = 1; i < 6; i += 3)
  {
    AnglePressure[i] = fmod(AnglePressure[i], 360.0);
    if (AnglePressure[i] > 180)
      AnglePressure[i] -= 360;
    else if (AnglePressure[i] < -180)
      AnglePressure[i] += 360;

    if (AnglePressure[i] > 90)
    {
      AnglePressure[i] = 180 - AnglePressure[i];
      AnglePressure[i] = -AnglePressure[i];
    }
    else if (AnglePressure[i] < -90)
    {
      AnglePressure[i] = -180 - AnglePressure[i];
      AnglePressure[i] = -AnglePressure[i];
    }
  }
}

void writeUint16Le(uint8_t *packet, size_t offset, uint16_t value)
{
  packet[offset] = value & 0xFF;
  packet[offset + 1] = (value >> 8) & 0xFF;
}

uint16_t packetChecksum(const uint8_t *packet)
{
  uint16_t checksum = 0;
  for (size_t i = 0; i < RGC_PACKET_SIZE - 2; ++i)
    checksum += packet[i];
  return checksum;
}

void buildDataPacket(uint8_t *packet)
{
  packet[0] = 'R';
  packet[1] = 'G';
  packet[2] = RGC_PACKET_VERSION;
  packet[3] = RGC_PAYLOAD_LENGTH;
  writeUint16Le(packet, 4, webBleSequence++);

  for (int i = 0; i < 6; ++i)
  {
    int16_t encodedAngle = (int16_t)round(AnglePressure[i] * 100.0f);
    writeUint16Le(packet, 6 + i * 2, (uint16_t)encodedAngle);
  }

  for (int i = 0; i < 18; ++i)
  {
    uint16_t encodedPressure = (uint16_t)round(AnglePressure[6 + i]);
    writeUint16Le(packet, 18 + i * 2, encodedPressure);
  }

  writeUint16Le(packet, 54, packetChecksum(packet));
}

void sendBlePacket(const uint8_t *packet, size_t length)
{
  if (!webBleConnected || !pWebDataCharacteristic)
    return;

  for (size_t offset = 0; offset < length; offset += BLE_NOTIFY_CHUNK_SIZE)
  {
    size_t chunkLen = min(BLE_NOTIFY_CHUNK_SIZE, length - offset);
    pWebDataCharacteristic->setValue((uint8_t *)(packet + offset), chunkLen);
    pWebDataCharacteristic->notify();
    delay(3);
  }
}

void sendDataToWebBle()
{
  if (millis() - lastBleNotifyMs < BLE_NOTIFY_INTERVAL_MS)
    return;
  lastBleNotifyMs = millis();

  uint8_t packet[RGC_PACKET_SIZE];
  buildDataPacket(packet);
  sendBlePacket(packet, sizeof(packet));
}

void setupWebBleServer()
{
  pWebServer = BLEDevice::createServer();
  pWebServer->setCallbacks(new WebBleServerCallbacks());

  BLEService *service = pWebServer->createService(WEB_BLE_SERVICE_UUID);
  pWebDataCharacteristic = service->createCharacteristic(
      WEB_BLE_DATA_CHAR_UUID,
      BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY | BLECharacteristic::PROPERTY_WRITE);
  pWebDataCharacteristic->addDescriptor(new BLE2902());
  pWebDataCharacteristic->setCallbacks(new WebBleCommandCallbacks());
 
  uint8_t initialPacket[RGC_PACKET_SIZE] = {0};
  buildDataPacket(initialPacket);
  pWebDataCharacteristic->setValue(initialPacket, sizeof(initialPacket));

  service->start();
  BLEAdvertising *advertising = BLEDevice::getAdvertising();
  advertising->addServiceUUID(WEB_BLE_SERVICE_UUID);
  advertising->setScanResponse(true);
  advertising->setMinPreferred(0x06);
  advertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();
  Serial.printf("Web BLE server started: %s\n", WEB_BLE_DEVICE_NAME);
}

void setupSensorBleClient()
{
  pClient = BLEDevice::createClient();
  Serial.println("Connecting to sensor BLE device...");
  if (pClient->connect(targetAddress))
  {
    Serial.println("Sensor BLE connected.");
    BLERemoteService *pSvc = pClient->getService(sensorServiceUUID);
    if (pSvc)
    {
      pNotifyCharacteristic = pSvc->getCharacteristic(sensorNotifyUUID);
      if (pNotifyCharacteristic && pNotifyCharacteristic->canNotify())
      {
        pNotifyCharacteristic->registerForNotify(notifyCallback);
        Serial.println("Sensor BLE notify enabled.");
      }
    }
  }
  else
  {
    Serial.println("Sensor BLE connection failed!");
  }
}

void setupImuAndPins()
{
#ifdef RIGHT
  upperArmSerial.begin(115200, SERIAL_8N1, 2, 3);
  lowerArmSerial.begin(115200, SERIAL_8N1, 10, 11);
#else
  upperArmSerial.begin(115200, SERIAL_8N1, 10, 11);
  lowerArmSerial.begin(115200, SERIAL_8N1, 2, 3);
#endif

  Serial.println("IMU serial initialized.");
  pinMode(1, OUTPUT);
  pinMode(4, OUTPUT);
  pinMode(9, OUTPUT);
  pinMode(12, OUTPUT);

  digitalWrite(1, LOW);
  digitalWrite(4, HIGH);
  digitalWrite(9, LOW);
  digitalWrite(12, HIGH);
}

void calculateZeroError()
{
  for (int i = 0; i < sample_count; i++)
  {
    processSensor(upperArmSerial, state1, bufferIndex1, buffer1, upperArmData, "upperArm");
    processSensor(lowerArmSerial, state2, bufferIndex2, buffer2, lowerArmData, "lowerArm");

    while (!upperArmData.newData || !lowerArmData.newData)
    {
      processSensor(upperArmSerial, state1, bufferIndex1, buffer1, upperArmData, "upperArm");
      processSensor(lowerArmSerial, state2, bufferIndex2, buffer2, lowerArmData, "lowerArm");
      delay(10);
    }

    sum_roll_upper += upperArmData.roll;
    sum_pitch_upper += upperArmData.pitch;
    sum_yaw_upper += upperArmData.yaw;
    sum_roll_lower += lowerArmData.roll;
    sum_pitch_lower += lowerArmData.pitch;
    sum_yaw_lower += lowerArmData.yaw;

    upperArmData.newData = false;
    lowerArmData.newData = false;
    delay(50);
  }

  zero_error_roll_upper = sum_roll_upper / sample_count;
  zero_error_pitch_upper = sum_pitch_upper / sample_count;
  zero_error_yaw_upper = sum_yaw_upper / sample_count;
  zero_error_roll_lower = sum_roll_lower / sample_count;
  zero_error_pitch_lower = sum_pitch_lower / sample_count;
  zero_error_yaw_lower = sum_yaw_lower / sample_count;
  Serial.printf("upper zero error: roll=%.2f, pitch=%.2f, yaw=%.2f\n", zero_error_roll_upper, zero_error_pitch_upper, zero_error_yaw_upper);
  Serial.printf("lower zero error: roll=%.2f, pitch=%.2f, yaw=%.2f\n", zero_error_roll_lower, zero_error_pitch_lower, zero_error_yaw_lower);
}

void setup()
{
  Serial.begin(115200);
  delay(300);
  Serial.println("RGC BLE backend starting...");

  setupImuAndPins();
  calculateZeroError();

  BLEDevice::init(WEB_BLE_DEVICE_NAME);
  setupWebBleServer();
  setupSensorBleClient();
}

void loop()
{
  if (pClient && !pClient->isConnected())
    reconnectSensorBle();

  processSensor(upperArmSerial, state1, bufferIndex1, buffer1, upperArmData, "upperArm");
  processSensor(lowerArmSerial, state2, bufferIndex2, buffer2, lowerArmData, "lowerArm");

  if (upperArmData.newData && lowerArmData.newData)
  {
    normalizeAnglePressure();
    upperArmData.newData = false;
    lowerArmData.newData = false;
    sendDataToWebBle();
  }
}
