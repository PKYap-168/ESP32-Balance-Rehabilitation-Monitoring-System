# Smart Balance Rehabilitation Monitoring and Control System

An ESP32-based rehabilitation monitoring platform designed to measure bilateral weight distribution, evaluate balance symmetry using the Absolute Symmetry Index (ASI), provide real-time visual and audio feedback, and record rehabilitation progress through a web-based interface and Firebase Realtime Database.

## Project Overview

This project was developed as part of the Microprocessor and Embedded Systems module at Asia Pacific University of Technology & Innovation (APU).

The objective of the system is to support balance rehabilitation by monitoring the user's left and right weight distribution in real time.

Four load cells are installed beneath the rehabilitation platform and divided into left and right measurement channels. Two HX711 modules amplify and convert the load-cell signals before the data are processed by an ESP32.

The system does more than display the measured weight. It evaluates bilateral balance using the Absolute Symmetry Index (ASI), provides visual and audio feedback, records rehabilitation sessions, stores patient data using Firebase Realtime Database, and allows historical rehabilitation progress to be reviewed through a web-based interface.

<p align="center">
  <img width="888" height="505" alt="image" src="https://github.com/user-attachments/assets/339d88bc-da18-4cf0-be61-1742744170cb" />

</p>

<p align="center">
  <em>Completed Balance Rehabilitation Monitoring and Control prototype.</em>
</p>

## Key Features

- Real-time left and right weight measurement
- 4 × 50 kg half-bridge load cells
- 2 × HX711 load-cell modules
- ESP32-based sensing and control
- Absolute Symmetry Index (ASI)
- Real-time balance classification
- 0.96-inch OLED display
- DFPlayer Mini audio feedback
- Web-based monitoring dashboard
- Start Session / End Session / Tare control
- Session timer
- Average ASI
- Maximum ASI
- Balanced-time percentage
- Session performance score
- Firebase Realtime Database integration
- Patient-specific session records
- Session history
- Historical rehabilitation graphs
- Automated multi-session trend assessment
- System-generated progress suggestion

## System Architecture

The final system follows a distributed architecture:

```text
Patient
   ↓
Balance Platform
   ↓
4 × Load Cells
   ↓
2 × HX711 Modules
   ↓
ESP32
   ↓
Web Application
   ↓
Firebase Realtime Database
```

<p align="center">
  <img width="496" height="1003" alt="image" src="https://github.com/user-attachments/assets/2cfa56ec-9e90-4838-bb98-25c5eee0e649" />

</p>
<p align="center">
  <em>Overall system architecture of the Balance Rehabilitation Monitoring and Control System.</em>
</p>

<p align="center">
  <img width="425" height="943" alt="image" src="https://github.com/user-attachments/assets/dc4eac1e-1f7f-423e-8501-1852b5103fd1" />

</p>

<p align="center">
  <em>Software architecture of the system.</em>
</p>

## Hardware Used

<div align="center">
  
  | Component | Quantity | Function |
  | :--- | :---: | :--- |
  | ESP32 | 1 | Main embedded controller | 
  | 50 kg half-bridge load cell | 4 | Weight measurement |
  | HX711 module | 2 | Load-cell amplification and ADC |
  | 0.96-inch OLED | 1 | Local system display |
  | DFPlayer Mini | 1 | Audio feedback |
  | 4 Ω speaker | 1 | Voice output |
  | Balance platform | 1 | Patient standing surface |
  
</div>

## Weight Distribution Calculation 
The total measured is:
<p align="center">
  $$
W_{T} = W_{L} + W_{R}
$$
</p>

The left-side percentage is:
<p align="center">
  $$
P_L = \frac{W_L}{W_L + W_R} \times 100\%
$$
</p>

The right-side percentage is:
<p align="center">
  $$
P_R = \frac{W_R}{W_L + W_R} \times 100\%
$$
</p>

Where:
$W_L =$ measured weight on the left side;
$W_R =$ measured weight on the right side; and
$W_T =$ total measured weight.

## Absolute Symmetry Index (ASI)
The Absolute Symmetry Index is used as the main indicator of bilateral balance symmetry.
<p align="center">
  $$
ASI = 2\left|\frac{W_L-W_R}{W_L+W_R}\right|\times100\%
$$
</p>

An ASI value close to 0% indicates more symmetrical loading.
For this prototype, an ASI value of **10% or below** is treated as the **balanced** region. The 10% threshold is used as an engineering criterion for prototype testing and is **NOT** intended as a universal clinical diagnostic threshold. 

## Session Metrics
During each rehabilitation session, the system monitors the following:
1. Current ASI
2. Average ASI
3. Maximum ASI
4. Balanced-time percentage
5. Valid sample counts
6. Session duration
7. Session performance score

Balanced time is calculated as:
<p align="center">
  $$
\text{Balanced Time}(\%) = \frac{N_{\text{balanced}}}{N_{\text{valid}}} \times 100\%
$$
</p>
The prototype performance score is calculated using:
<p align="center">
  $$
\text{Performance} = \text{clamp}(100 - ASI_{\text{avg}}, 0, 100)
$$
</p>

The performance score is intended for session comparison within the prototype and is **NOT** a clinically validated score.

## Web-Based Montoring
The web interface acts as the main monitoring and control platform. Its main functions include:
- ESP32 connection status
- Live left and right weight display
- Left/right weight-distribution percentage
- Current ASI
- Average ASI
- Maximum ASI
- Balanced-time percentage
- Balance status
- Session timer
- Start Session
- End Session
- Tare / calibration
- Session summary
- Patient records
- Historical session data
- Rehabilitation progress graph
- Multi-session trend assessment

## ESP32 Communication 
The ESP32 operates as a lightweight HTTP server. Its main endpoints include:
```text
/data
/start
/stop
/tare
```
The ```/data``` endpoint provides real-time sensor and system information to the web interface using JSON.

## Firebase Integration
Firebase Realtime Database is used for persistent online storage. The patient ID is used directly as the database key, allowing each patient to maintain an independent rehabilitation record. 
A simplified database structure is:
```
balanceRehab
└── patients
    ├── PATIENT001
    ├── PATIENT002
    ├── PATIENT004
    ├── PATIENT008
    ├── PATIENT009
    └── PATIENT010
```
Each patient node stores the patient's information and associated rehabilitation-session records. A balance rehabilitation session contains information such as:
- Patient ID
- Patient name
- Session type
- Session timestamp
- Average ASI
- Maximum ASI
- Balanced-time percentage
- Performance score
- Valid sample count

The stored data can later be retrieved for historical comparison and rehabilitation progress analysis. 

## Rehabilitation Progress Tracking
The system compares multiple rehabilitation sessions. The progress can be evaluated using:
- changes in average ASI
- changes in maximum ASI
- changes in balanced-time percentage
- changes in session performance score

The trend assessment indicates whethe the measured rehabilitation performance appears to be either:
- Improving;
- Stable; or
- Declining

This feature is intended as a monitoring aid and **NOT** a clinical diagnosis.

## Historical Graphs and Trend Analysis
The system does not only store completed rehabilitation sessions. Historical data are retrieved from Firebase and displayed graphically so that both the therapist and patient can observe changes across multiple sessions.

The web interface generates several rehabilitation progress graphs, including:

- Average ASI across sessions
- Balanced-time percentage across sessions
- Session performance score across sessions

These graphs make it easier to identify changes in rehabilitation performance over time.

For example:

- A decreasing Average ASI generally indicates improved bilateral symmetry.
- An increasing Balanced-Time percentage indicates that the patient is maintaining a balanced condition for a larger portion of the session.
- An increasing Performance Score indicates improved performance according to the prototype-specific scoring method.

The graphs therefore convert stored numerical data into a more intuitive representation of rehabilitation progress.

### Rehabilitation Progress Graphs

<p align="center">
  <img width="649" height="555" alt="image" src="https://github.com/user-attachments/assets/ed4dfcb0-7f76-4106-a1a6-e7e876ff4fbc" />

</p>

<p align="center">
  <em>Average ASI across multiple rehabilitation sessions. Lower values indicate improved bilateral symmetry.</em>
</p>

<p align="center">
  <img width="601" height="605" alt="image" src="https://github.com/user-attachments/assets/afdaa20c-6d58-4031-8491-e2a94a11b368" />

</p>

<p align="center">
  <em>Balanced-Time and Performance Score progression across multiple sessions.</em>
</p>

### Trend Assessment
Once sufficient rehabilitation sessions have been recorded, the web application performs a basic trend analysis using the patient's recent session data.

The system compares metrics such as:

- Average ASI
- Balanced-Time percentage
- Performance Score
- Recent session-to-session changes

The trend assessment can classify the patient's recent measured performance as:

- Improving
- Relatively Stable
- Deteriorating
- Mixed Trend

<p align="center">
  <img width="616" height="224" alt="image" src="https://github.com/user-attachments/assets/4ceac0c5-0703-4e6b-9c01-3f6fb2898fe9" />

</p>

<p align="center">
  <em>Automated trend assessment generated from the patient's recent rehabilitation sessions.</em>
</p>

### System Suggestion
Based on the trend assessment, the web application also generates a short system suggestion to assist with interpretation.

For example, if Average ASI improves while Balanced Time decreases, the system may identify a mixed trend and recommend continuing monitoring before drawing a conclusion.

The system suggestion is intended as an engineering decision-support feature only. It does not provide medical diagnosis or treatment recommendations.

<p align="center">
  <img width="587" height="173" alt="image" src="https://github.com/user-attachments/assets/7589803b-ef47-453b-b71c-db9c805b7963" />

</p>

<p align="center">
  <em>System-generated suggestion based on the recent balanced trend.</em>
</p>

### Numerical Session History
In addition to graphical analysis, the web application displays numerical records for individual rehabilitation sessions.

Each session can include:

- Session date and time
- Session duration
- Average ASI
- Maximum ASI
- Balanced-Time percentage
- Performance Score
- Valid sample count

This allows the therapist to examine individual sessions in detail while also reviewing the overall rehabilitation trend.

<p align="center">
  <img width="633" height="645" alt="image" src="https://github.com/user-attachments/assets/78a42647-64b0-4811-91c4-b782782a2e90" />

</p>

<p align="center">
  <em>Numerical history of completed rehabilitation sessions for the selected patient.</em>
</p>


## Testing Results
The system was tested under different balance conditions.
<div align="center">
  
  | Condition | Left(%) | Right(%) | ASI(%) | Interpretation |
  | :---: | :---: | :---: | :---: | :---: | 
  | Centered | 51.8 | 48.2 | 7.2 | Balanced |
  | Lean Left | 64.5 | 35.5 | 58.0 | Left asymmetry |
  | Lean Right | 37.2 | 62.8 | 51.2 | Right asymmetry |
  
</div>

The results show that the system can distinguish between relatively symmetrical standing and intentional left or right loading.

## Engineering Challenges
Several technical issues were encountered during deployment.

### ESP32 Brownout
Unexpected ESP32 resets occurred due to unstable power delivery.

**Solution:**
A more reliable USB cable and stable 5V power supply were used. 

### HX711 Communication 
The HX711 modules occasionally became unavailable or delayed sensor readings.

**Solution:**
Readiness checks and improved sensor handling were implemented.

### Load-Cell Calibration
The left and right channels initially produced different responses. 

**Solution:**
Both measurement channels were calibrated independently and a tare function was implemented.

### DFPlayer Initialization
The DFPlayer Mini initially experienced UART communication issues.

**Solution:**
The UART configuration and wiring were corrected and the audio subsystem was tested separately.

### Firebase / ESP32 Instability
Frequent direct Firebase communication increased network and memory demand on the ESP32.

**Solution:**
The system architecture was redesigned so that the ESP32 focuses on real-time sensing and hardware control while the browser handles higher-level processing and Firebase communication.

## Limitations
Current limitations of the prototype include:
- Mainly evaluates left-right weight distribution
- Does not provide full centre-of-pressure tracking
- Requires correct load-cell calibration
- Foot placement can affect measurement consistency
- The 10% ASI threshold is a prototype criterion
- Online functions depend on network availability
- Trend assessment has not undergone clinical validation
- The prototype is not a certified medical device

## Future Improvements
Several possible future developments include:
- Patient-specific ASI thresholds
- Four-zone force measurement
- Centre-of-pressure tracking
- Therapist-defined rehabilitation targets
- Improved long-term trend analysis
- Secure Firebase authentication
- Offline session storage and synchronization
- Automatic patient identification
- Multilingual audio feedback
- Mobile and tablet optimization
- Improved mechanical platform design
- Clinical comparison with recognised force-plate system

## My Contribution
My individual contribution focused on the Balance Rehabilitation Monitoring and Control subsystem.

My work included:
- hardware selection and interfacing
- load-cell calibration
- ESP32 programming
- ASI implementation
- OLED display integration
- DFPlayer audio feedback
- HTTP communication
- web interface development
- Firebase integration
- patient and session management
- rehabilitation history
- progress graphs
- trend assessment
- testing and troubleshooting

## Disclaimer
This project is an academic engineering prototype developed for educational and research purposes. It is **NOT** a certified medical device and should not be used as a replacement for professional clinical assessment.

## Author
**Yap Peng Kun**

Mechatronics Engineering

Asia Pacific University of Technology and Innovation
