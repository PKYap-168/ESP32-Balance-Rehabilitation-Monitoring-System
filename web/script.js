import {
  database,
  ref,
  set,
  onValue,
} from "./firebase-config.example.js";

const ESP32_IP = "YOUR_ESP32_IP"; // CHANGE THIS
const ESP32_URL = `http://${ESP32_IP}`;

let elapsedSeconds = 0;
let timerInterval = null;
let sessionRunningLocal = false;


// PATIENT MANAGEMENT
let currentPatientId = null;
let currentPatientName = null;

let patientsCache = {};

let currentSessionTimestamp = null;
// HISTORY MANAGEMENT
let historyUnsubscribe = null;
// PROGRESS CHARTS
let averageASIChart = null;
let balancedTimeChart = null;
let performanceChart = null;

// SESSION ANALYSIS
let sessionSampleCount = 0;
let asiSum = 0;
let maxASI = 0;
let balancedSampleCount = 0;

//Prototype engineering threshold
const BALANCED_ASI_THRESHOLD = 10.0;

// Ignore readings when nobody is on the platform
const MINIMUM_USER_WEIGHT = 5.0;

// ========================================
// PROGRESS ASSESSMENT SETTINGS
// ========================================

// Minimum change considered meaningful
// by this prototype trend algorithm.
//
// These are engineering thresholds,
// not clinical thresholds.

const ASI_TREND_THRESHOLD = 1.0;

const BALANCED_TIME_TREND_THRESHOLD = 5.0;

const leftValue = document.getElementById("leftValue");
const rightValue = document.getElementById("rightValue");
const balanceStatus = document.getElementById("balanceStatus");
const stabilityScore = document.getElementById("stabilityScore");
const sessionTimer = document.getElementById("sessionTimer");
const connectionStatus = document.getElementById("connectionStatus");
const currentASI = document.getElementById("currentASI");
const averageASIDisplay = document.getElementById("averageASI");
const maximumASIDisplay = document.getElementById("maximumASI");
const balancedTimeDisplay = document.getElementById("balancedTime");
// ========================================
// NAVIGATION / HISTORY ELEMENTS
// ========================================

const dashboardMenuButton =
  document.getElementById(
    "dashboardMenuButton"
  );

const historyMenuButton =
  document.getElementById(
    "historyMenuButton"
  );

const dashboardView =
  document.getElementById(
    "dashboardView"
  );

const historyView =
  document.getElementById(
    "historyView"
  );

const historyPatientDisplay =
  document.getElementById(
    "historyPatientDisplay"
  );

const historySummary =
  document.getElementById(
    "historySummary"
  );

const historyList =
  document.getElementById(
    "historyList"
  );

const graphMessage =
  document.getElementById(
    "graphMessage"
  );

// PROGRESS ASSESSMENT ELEMENTS

const assessmentStatus =
  document.getElementById(
    "assessmentStatus"
  );

const assessmentASI =
  document.getElementById(
    "assessmentASI"
  );

const assessmentASITrend =
  document.getElementById(
    "assessmentASITrend"
  );

const assessmentBalancedTime =
  document.getElementById(
    "assessmentBalancedTime"
  );

const assessmentBalancedTrend =
  document.getElementById(
    "assessmentBalancedTrend"
  );

const systemSuggestionText =
  document.getElementById(
    "systemSuggestionText"
  );

// ========================================
// NAVIGATION
// ========================================

function showDashboard() {

  dashboardView.classList.remove(
    "hidden"
  );

  historyView.classList.add(
    "hidden"
  );

  dashboardMenuButton.classList.add(
    "active-menu"
  );

  historyMenuButton.classList.remove(
    "active-menu"
  );

  // Stop listening to history
  // while History page is closed
  if (historyUnsubscribe) {

    historyUnsubscribe();

    historyUnsubscribe = null;
  }
}


function showHistory() {

  // Prevent hiding the session controls
  // while a rehabilitation session is active
  if (sessionRunningLocal) {

    alert(
      "Please end the current session before opening History."
    );

    return;
  }


  dashboardView.classList.add(
    "hidden"
  );

  historyView.classList.remove(
    "hidden"
  );

  dashboardMenuButton.classList.remove(
    "active-menu"
  );

  historyMenuButton.classList.add(
    "active-menu"
  );


  loadPatientHistory();
}


dashboardMenuButton.addEventListener(
  "click",
  showDashboard
);


historyMenuButton.addEventListener(
  "click",
  showHistory
);

// PATIENT ELEMENTS

const patientSelect =
  document.getElementById(
    "patientSelect"
  );

const selectedPatientDisplay =
  document.getElementById(
    "selectedPatientDisplay"
  );

const showAddPatientButton =
  document.getElementById(
    "showAddPatientButton"
  );

const addPatientForm =
  document.getElementById(
    "addPatientForm"
  );

const newPatientId =
  document.getElementById(
    "newPatientId"
  );

const newPatientName =
  document.getElementById(
    "newPatientName"
  );

const createPatientButton =
  document.getElementById(
    "createPatientButton"
  );

const cancelPatientButton =
  document.getElementById(
    "cancelPatientButton"
  );


function pad2(value) {
  return String(value).padStart(2, "0");
}


// FORMAT SESSION TIMESTAMP FOR DISPLAY
function formatSessionTimestamp(
  timestamp
) {

  if (!timestamp) {

    return {
      date: "Unknown Date",
      time: ""
    };
  }


  const parts =
    timestamp.split("_");

  if (parts.length !== 2) {

    return {
      date: timestamp,
      time: ""
    };
  }


  const dateParts =
    parts[0].split("-");

  const timeParts =
    parts[1].split("-");


  if (
    dateParts.length !== 3 ||
    timeParts.length !== 3
  ) {

    return {
      date: timestamp,
      time: ""
    };
  }


  const year =
    Number(dateParts[0]);

  const month =
    Number(dateParts[1]);

  const day =
    Number(dateParts[2]);


  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];


  return {

    date:
      `${day} ${monthNames[month - 1]} ${year}`,

    time:
      `${timeParts[0]}:${timeParts[1]}:${timeParts[2]}`
  };
}

function formatDuration(
  totalSeconds
) {

  const seconds =
    Number(totalSeconds) || 0;

  const minutes =
    Math.floor(
      seconds / 60
    );

  const remainingSeconds =
    seconds % 60;


  if (minutes === 0) {

    return `${remainingSeconds} sec`;
  }


  return (
    `${minutes} min ` +
    `${remainingSeconds} sec`
  );
}

// ========================================
// DESTROY EXISTING PROGRESS CHARTS
// ========================================

function destroyProgressCharts() {

  if (averageASIChart) {

    averageASIChart.destroy();

    averageASIChart = null;
  }


  if (balancedTimeChart) {

    balancedTimeChart.destroy();

    balancedTimeChart = null;
  }


  if (performanceChart) {

    performanceChart.destroy();

    performanceChart = null;
  }
}

// ========================================
// RENDER PROGRESS CHARTS
// ========================================

function renderProgressCharts(
  sessionEntries
) {

  destroyProgressCharts();


  if (
    !sessionEntries ||
    sessionEntries.length === 0
  ) {

    resetProgressAssessment();

    graphMessage.textContent =
      "No session data available for progress graphs.";

    return;
  }


  /*
      History cards are displayed newest first.

      Graphs should instead run:
      Session 1 -> Session 2 -> Session 3

      Therefore create a chronological copy.
  */

  const chronologicalSessions =
    [...sessionEntries].sort(
      (a, b) =>
        a[0].localeCompare(
          b[0]
        )
    );


  const labels = [];

  const averageASIValues = [];

  const balancedTimeValues = [];

  const performanceValues = [];


  chronologicalSessions.forEach(
    (
      [
        sessionTimestamp,
        sessionData
      ],
      index
    ) => {

      const results =
        sessionData.results || {};


      labels.push(
        `Session ${index + 1}`
      );


      averageASIValues.push(
        Number(
          results.average_asi ?? 0
        )
      );


      balancedTimeValues.push(
        Number(
          results.balanced_time_percent ?? 0
        )
      );


      performanceValues.push(
        Number(
          results.performance_score ?? 0
        )
      );
    }
  );


  // =====================================
  // AVERAGE ASI
  // =====================================

  averageASIChart =
    new Chart(
      document.getElementById(
        "averageASIChart"
      ),
      {

        type: "line",

        data: {

          labels: labels,

          datasets: [
            {
              label: "Average ASI (%)",

              data:
                averageASIValues,

              tension: 0.25,

              pointRadius: 5,

              pointHoverRadius: 7
            }
          ]
        },


        options: {

          responsive: true,

          maintainAspectRatio: false,

          plugins: {

            legend: {
              display: false
            },

            tooltip: {

              callbacks: {

                label: function (context) {

                  return (
                    "Average ASI: " +
                    Number(
                      context.raw
                    ).toFixed(2) +
                    "%"
                  );
                }
              }
            }
          },


          scales: {

            y: {

              beginAtZero: true,

              title: {
                display: true,
                text: "Average ASI (%)"
              }
            },

            x: {

              title: {
                display: true,
                text: "Rehabilitation Session"
              }
            }
          }
        }
      }
    );


  // =====================================
  // BALANCED TIME
  // =====================================

  balancedTimeChart =
    new Chart(
      document.getElementById(
        "balancedTimeChart"
      ),
      {

        type: "line",

        data: {

          labels: labels,

          datasets: [
            {
              label:
                "Balanced Time (%)",

              data:
                balancedTimeValues,

              tension: 0.25,

              pointRadius: 5,

              pointHoverRadius: 7
            }
          ]
        },


        options: {

          responsive: true,

          maintainAspectRatio: false,

          plugins: {

            legend: {
              display: false
            },

            tooltip: {

              callbacks: {

                label: function (context) {

                  return (
                    "Balanced Time: " +
                    Number(
                      context.raw
                    ).toFixed(1) +
                    "%"
                  );
                }
              }
            }
          },


          scales: {

            y: {

              beginAtZero: true,

              max: 100,

              title: {
                display: true,
                text: "Balanced Time (%)"
              }
            },

            x: {

              title: {
                display: true,
                text: "Rehabilitation Session"
              }
            }
          }
        }
      }
    );


  // =====================================
  // PERFORMANCE SCORE
  // =====================================

  performanceChart =
    new Chart(
      document.getElementById(
        "performanceChart"
      ),
      {

        type: "line",

        data: {

          labels: labels,

          datasets: [
            {
              label:
                "Performance Score",

              data:
                performanceValues,

              tension: 0.25,

              pointRadius: 5,

              pointHoverRadius: 7
            }
          ]
        },


        options: {

          responsive: true,

          maintainAspectRatio: false,

          plugins: {

            legend: {
              display: false
            },

            tooltip: {

              callbacks: {

                label: function (context) {

                  return (
                    "Performance: " +
                    Number(
                      context.raw
                    ).toFixed(0) +
                    "/100"
                  );
                }
              }
            }
          },


          scales: {

            y: {

              beginAtZero: true,

              max: 100,

              title: {
                display: true,
                text: "Performance Score"
              }
            },

            x: {

              title: {
                display: true,
                text: "Rehabilitation Session"
              }
            }
          }
        }
      }
    );


  // =====================================
  // GRAPH MESSAGE
  // =====================================

  if (
    chronologicalSessions.length === 1
  ) {

    graphMessage.textContent =
      "One session recorded. Additional sessions are required to establish a progress trend.";

  } else if (
    chronologicalSessions.length === 2
  ) {

    graphMessage.textContent =
      "Two sessions recorded. More sessions are recommended before evaluating a trend.";

  } else {

    graphMessage.textContent =
      `${chronologicalSessions.length} sessions available for progress monitoring.`;
  }
}

// ========================================
// RESET PROGRESS ASSESSMENT
// ========================================

function resetProgressAssessment() {

  assessmentStatus.textContent =
    "Insufficient Data";

  assessmentASI.textContent =
    "--";

  assessmentASITrend.textContent =
    "--";

  assessmentBalancedTime.textContent =
    "--";

  assessmentBalancedTrend.textContent =
    "--";

  systemSuggestionText.textContent =
    "At least three sessions are required before a progress trend is assessed.";
}

// ========================================
// ASSESS RECENT BALANCE PROGRESS
// ========================================

function assessRecentProgress(
  sessionEntries
) {

  // At least 3 sessions are required
  if (
    !sessionEntries ||
    sessionEntries.length < 3
  ) {

    resetProgressAssessment();

    return;
  }


  /*
      Create chronological order:

      oldest -> newest
  */

  const chronologicalSessions =
    [...sessionEntries].sort(
      (a, b) =>
        a[0].localeCompare(
          b[0]
        )
    );


  /*
      Only use the latest 3 sessions.
  */

  const recentSessions =
    chronologicalSessions.slice(-3);


  const asiValues =
    recentSessions.map(
      ([, sessionData]) =>
        Number(
          sessionData.results
            ?.average_asi ?? 0
        )
    );


  const balancedValues =
    recentSessions.map(
      ([, sessionData]) =>
        Number(
          sessionData.results
            ?.balanced_time_percent ?? 0
        )
    );


  /*
      Compare first session in the
      recent window with latest session.

      Example:

      ASI:
      15 -> 12 -> 9

      change = 9 - 15 = -6
      Negative = improvement

      Balanced:
      50 -> 65 -> 80

      change = 80 - 50 = +30
      Positive = improvement
  */

  const asiChange =
    asiValues[2] -
    asiValues[0];


  const balancedChange =
    balancedValues[2] -
    balancedValues[0];


  // =====================================
  // ASI TREND
  // =====================================

  let asiTrend = "stable";


  if (
    asiChange <
    -ASI_TREND_THRESHOLD
  ) {

    asiTrend = "improving";

  } else if (
    asiChange >
    ASI_TREND_THRESHOLD
  ) {

    asiTrend = "worsening";
  }


  // =====================================
  // BALANCED TIME TREND
  // =====================================

  let balancedTrend =
    "stable";


  if (
    balancedChange >
    BALANCED_TIME_TREND_THRESHOLD
  ) {

    balancedTrend =
      "improving";

  } else if (
    balancedChange <
    -BALANCED_TIME_TREND_THRESHOLD
  ) {

    balancedTrend =
      "worsening";
  }


  // =====================================
  // DISPLAY RECENT VALUES
  // =====================================

  assessmentASI.textContent =
    asiValues
      .map(
        value =>
          value.toFixed(2)
      )
      .join(" → ") +
    "%";


  assessmentBalancedTime.textContent =
    balancedValues
      .map(
        value =>
          value.toFixed(1)
      )
      .join(" → ") +
    "%";


  // =====================================
  // DISPLAY INDIVIDUAL TRENDS
  // =====================================

  if (asiTrend === "improving") {

    assessmentASITrend.textContent =
      "↓ Improving";

  } else if (
    asiTrend === "worsening"
  ) {

    assessmentASITrend.textContent =
      "↑ Needs attention";

  } else {

    assessmentASITrend.textContent =
      "Approximately stable";
  }


  if (
    balancedTrend === "improving"
  ) {

    assessmentBalancedTrend.textContent =
      "↑ Improving";

  } else if (
    balancedTrend === "worsening"
  ) {

    assessmentBalancedTrend.textContent =
      "↓ Needs attention";

  } else {

    assessmentBalancedTrend.textContent =
      "Approximately stable";
  }


  // =====================================
  // OVERALL ASSESSMENT
  // =====================================

  if (
    asiTrend === "improving" &&
    balancedTrend === "improving"
  ) {

    assessmentStatus.textContent =
      "Improving";


    systemSuggestionText.textContent =
      "Positive progress is present across the three most recent recorded balance sessions. Continue monitoring for 3 additional sessions before reassessing the trend.";

  }


  else if (
    asiTrend === "worsening" &&
    balancedTrend === "worsening"
  ) {

    assessmentStatus.textContent =
      "Needs Review";


    systemSuggestionText.textContent =
      "The recent recorded balance trend shows increased asymmetry together with reduced balanced time. Consider reviewing the recent session results with the therapist.";

  }


  else if (
    asiTrend === "stable" &&
    balancedTrend === "stable"
  ) {

    assessmentStatus.textContent =
      "Stable";


    systemSuggestionText.textContent =
      "Recent balance measurements are relatively stable. Continue monitoring for 3 additional sessions before reassessing the trend.";

  }


  else {

    assessmentStatus.textContent =
      "Mixed Trend";


    systemSuggestionText.textContent =
      "The recent balance measurements show mixed changes between Average ASI and Balanced Time. Continue monitoring and review the individual session results before drawing a conclusion.";
  }
}

// ========================================
// LOAD BALANCE SESSION HISTORY
// ========================================

function loadPatientHistory() {

  // Stop listening to the previous
  // patient's history
  if (historyUnsubscribe) {

    historyUnsubscribe();

    historyUnsubscribe = null;
  }


  historyList.innerHTML = "";


  // No patient selected
  if (!currentPatientId) {

    destroyProgressCharts();

    resetProgressAssessment();

    graphMessage.textContent = "Select a patient to view graphs.";

    historyPatientDisplay.textContent =
      "No patient selected";


    historySummary.innerHTML =
      `
            <p>
                Please select a patient from
                the Dashboard first.
            </p>
            `;


    historyList.innerHTML =
      `
            <div class="history-empty">
                No patient selected.
            </div>
            `;

    return;
  }


  historyPatientDisplay.textContent =
    currentPatientName
      ? `${currentPatientId} - ${currentPatientName}`
      : currentPatientId;


  historySummary.innerHTML =
    `
        <p>
            Loading balance rehabilitation
            history...
        </p>
        `;


  /*
      Read ONLY:

      patients/
        PATIENTxxx/
          sessions/
            balance/
              balance_rehabilitation/
  */

  const historyRef =
    ref(
      database,
      `patients/${currentPatientId}/sessions/balance/balance_rehabilitation`
    );


  historyUnsubscribe =
    onValue(
      historyRef,
      (snapshot) => {

        const sessions =
          snapshot.val() || {};


        const sessionEntries =
          Object.entries(
            sessions
          );


        if (
          sessionEntries.length === 0
        ) {

          destroyProgressCharts();
          resetProgressAssessment();

          graphMessage.textContent = "No session data available for progress graphs.";

          historySummary.innerHTML =
            `
                        <p>
                            No balance rehabilitation
                            sessions recorded yet.
                        </p>
                        `;


          historyList.innerHTML =
            `
                        <div class="history-empty">
                            No previous balance sessions
                            found for this patient.
                        </div>
                        `;

          return;
        }


        /*
            Timestamp format:
            YYYY-MM-DD_HH-MM-SS

            Because it is year -> month ->
            day -> hour -> minute -> second,
            normal string sorting works.
        */

        sessionEntries.sort(
          (a, b) =>
            b[0].localeCompare(
              a[0]
            )
        );

        // Update progress graphs
        renderProgressCharts(sessionEntries);

        assessRecentProgress(
          sessionEntries
        );


        historySummary.innerHTML =
          `
                    <p>
                        <strong>
                            ${sessionEntries.length}
                        </strong>
                        balance session${sessionEntries.length === 1
            ? ""
            : "s"
          }
                        recorded.
                    </p>
                    `;


        historyList.innerHTML = "";


        sessionEntries.forEach(
          (
            [
              sessionTimestamp,
              sessionData
            ],
            index
          ) => {


            const metadata =
              sessionData.metadata || {};


            const results =
              sessionData.results || {};


            const displayTime =
              formatSessionTimestamp(
                metadata.timestamp ||
                sessionTimestamp
              );


            const sessionCard =
              document.createElement(
                "div"
              );


            sessionCard.className =
              "history-session";


            sessionCard.innerHTML =
              `
                            <h3>
                                Session ${sessionEntries.length -
              index
              }
                            </h3>

                            <p class="history-session-time">
                                ${displayTime.date}
                                &nbsp; | &nbsp;
                                ${displayTime.time}
                            </p>


                            <div class="history-row">
                                <span>
                                    Duration
                                </span>

                                <strong>
                                    ${formatDuration(
                results.duration_seconds
              )}
                                </strong>
                            </div>


                            <div class="history-row">
                                <span>
                                    Average ASI
                                </span>

                                <strong>
                                    ${results.average_asi ??
              "--"
              } %
                                </strong>
                            </div>


                            <div class="history-row">
                                <span>
                                    Maximum ASI
                                </span>

                                <strong>
                                    ${results.max_asi ??
              "--"
              } %
                                </strong>
                            </div>


                            <div class="history-row">
                                <span>
                                    Balanced Time
                                </span>

                                <strong>
                                    ${results.balanced_time_percent ??
              "--"
              } %
                                </strong>
                            </div>


                            <div class="history-row">
                                <span>
                                    Performance
                                </span>

                                <strong>
                                    ${results.performance_score ??
              "--"
              } / 100
                                </strong>
                            </div>


                            <div class="history-row">
                                <span>
                                    Valid Samples
                                </span>

                                <strong>
                                    ${results.sample_count ??
              "--"
              }
                                </strong>
                            </div>
                            `;


            historyList.appendChild(
              sessionCard
            );
          }
        );
      },
      (error) => {

        console.error(
          "Unable to load patient history:",
          error
        );


        historySummary.innerHTML =
          `
                    <p>
                        Unable to load history.
                    </p>
                    `;


        historyList.innerHTML =
          `
                    <div class="history-empty">
                        Firebase history could not
                        be loaded.
                    </div>
                    `;
      }
    );
}

// Used as Firebase session ID
// Example: 2026-09-03_14-25-32
function createSessionTimestamp(date = new Date()) {

  return (
    date.getFullYear() +
    "-" +
    pad2(date.getMonth() + 1) +
    "-" +
    pad2(date.getDate()) +
    "_" +
    pad2(date.getHours()) +
    "-" +
    pad2(date.getMinutes()) +
    "-" +
    pad2(date.getSeconds())
  );
}


// Used for synced_at metadata
// Example: 2026-09-03T14:25:32
function createLocalISOTime(date = new Date()) {

  return (
    date.getFullYear() +
    "-" +
    pad2(date.getMonth() + 1) +
    "-" +
    pad2(date.getDate()) +
    "T" +
    pad2(date.getHours()) +
    ":" +
    pad2(date.getMinutes()) +
    ":" +
    pad2(date.getSeconds())
  );
}

// LOAD PATIENTS FROM FIREBASE
// LOAD PATIENTS FROM SHARED FIREBASE REGISTRY
function loadPatients() {

  const patientsRef =
    ref(
      database,
      "patients"
    );

  onValue(
    patientsRef,
    (snapshot) => {

      patientsCache =
        snapshot.val() || {};

      const previousSelection =
        currentPatientId;

      patientSelect.innerHTML =
        '<option value="">Select Patient</option>';


      Object.entries(
        patientsCache
      ).forEach(
        ([patientId, patientData]) => {

          if (
            !patientData.profile
          ) {
            return;
          }

          const profile =
            patientData.profile;

          const actualPatientId =
            profile.patient_id ||
            patientId;

          const patientName =
            profile.name || "";


          const option =
            document.createElement(
              "option"
            );


          // Patient ID itself is now
          // the Firebase patient identifier
          option.value =
            actualPatientId;


          option.textContent =
            patientName
              ? `${actualPatientId} - ${patientName}`
              : actualPatientId;


          patientSelect.appendChild(
            option
          );
        }
      );


      // Keep selected patient
      if (previousSelection) {

        patientSelect.value =
          previousSelection;
      }
    }
  );
}


// PATIENT SELECTION
patientSelect.addEventListener(
  "change",
  () => {

    const selectedPatientId =
      patientSelect.value;

    if (!selectedPatientId) {

      currentPatientId = null;
      currentPatientName = null;

      selectedPatientDisplay.textContent =
        "No patient selected";

      historyPatientDisplay.textContent =
        "No patient selected";


      if (
        !historyView.classList.contains(
          "hidden"
        )
      ) {

        loadPatientHistory();
      }

      return;
    }




    const patient =
      patientsCache[
      selectedPatientId
      ];


    if (
      !patient ||
      !patient.profile
    ) {
      return;
    }


    currentPatientId =
      selectedPatientId;

    currentPatientName =
      patient.profile.name || "";


    selectedPatientDisplay.textContent =
      currentPatientName
        ? `${currentPatientId} - ${currentPatientName}`
        : currentPatientId;


    console.log(
      "Selected patient:",
      {
        patientId:
          currentPatientId,

        patientName:
          currentPatientName
      }
    );

    // Keep History patient information
    // synchronized
    historyPatientDisplay.textContent =
      currentPatientName
        ? `${currentPatientId} - ${currentPatientName}`
        : currentPatientId;


    // If History is currently open,
    // refresh it immediately
    if (
      !historyView.classList.contains(
        "hidden"
      )
    ) {

      loadPatientHistory();
    }
  }
);

// SHOW / HIDE PATIENT FORM
showAddPatientButton.addEventListener(
  "click",
  () => {

    addPatientForm.classList.remove(
      "hidden"
    );

    showAddPatientButton.disabled = true;

  }

);

cancelPatientButton.addEventListener(
  "click",
  () => {

    addPatientForm.classList.add("hidden");

    showAddPatientButton.disabled = false;

    newPatientId.value = "";
    newPatientName.value = "";

  }

);



// CHECK FOR DUPLICATE PATIENT ID
function patientIdAlreadyExists(patientId) {

  const normalizedId =
    patientId
      .trim()
      .toUpperCase();

  return Object.keys(
    patientsCache
  ).some(
    (existingPatientId) =>
      existingPatientId
        .trim()
        .toUpperCase()
      === normalizedId
  );
}


// CREATE NEW PATIENT
createPatientButton.addEventListener(
  "click",
  async () => {

    const patientId =
      newPatientId.value
        .trim()
        .toUpperCase();

    const patientName =
      newPatientName.value
        .trim();

    if (!patientId) {

      alert(
        "Please enter a Patient ID."
      );

      return;
    }

    if (!patientName) {

      alert(
        "Please enter the patient name."
      );

      return;
    }

    // Prevent duplicate visible Patient IDs
    if (
      patientIdAlreadyExists(
        patientId
      )
    ) {

      alert(
        "This Patient ID already exists. Please select the existing patient."
      );

      return;
    }

    try {

      createPatientButton.disabled =
        true;

      createPatientButton.textContent =
        "Creating...";


      const patientProfileRef =
        ref(database, `patients/${patientId}/profile`);

      const patientData = {
        patient_id: patientId,
        name: patientName,
      }

      await set(
        patientProfileRef,
        patientData
      );


      // Automatically select
      // newly-created patient
      currentPatientId =
        patientId;

      currentPatientName =
        patientName;


      selectedPatientDisplay.textContent =
        `${patientId} - ${patientName}`;

      historyPatientDisplay.textContent =
        `${patientId} - ${patientName}`;


      addPatientForm.classList.add(
        "hidden"
      );


      newPatientId.value = "";
      newPatientName.value = "";


      console.log(
        "Patient created:",
        {
          patientId:
            currentPatientId,

          name:
            currentPatientName
        }
      );


      // Give onValue a moment to refresh
      setTimeout(() => {

        patientSelect.value =
          currentPatientId;

      }, 100);


    } catch (error) {

      console.error(
        "Unable to create patient:",
        error
      );

      alert(
        "Unable to create patient."
      );

    } finally {

      createPatientButton.disabled =
        false;

      createPatientButton.textContent =
        "CREATE PATIENT";

      showAddPatientButton.disabled =
        false;
    }
  }
);

async function updateLiveData() {
  try {
    const response = await fetch(`${ESP32_URL}/data`);

    if (!response.ok) {
      throw new Error(`ESP32 returned ${response.status}`);
    }

    const data = await response.json();

    const leftKg = Number(data.leftKg);
    const rightKg = Number(data.rightKg);

    if (sessionRunningLocal) {
      recordSessionSample(
        leftKg,
        rightKg
      );
    }

    // Update website
    leftValue.textContent =
      Number(data.leftPercent).toFixed(1);

    rightValue.textContent =
      Number(data.rightPercent).toFixed(1);

    balanceStatus.textContent =
      data.status;

    connectionStatus.textContent =
      "Connected";

    // Upload same data to Firebase
    await set(
      ref(database, "balanceRehab/live"),
      {
        leftKg: Number(data.leftKg),
        rightKg: Number(data.rightKg),
        totalKg: Number(data.totalKg),

        leftPercent:
          Number(data.leftPercent),

        rightPercent:
          Number(data.rightPercent),

        status: data.status,

        sessionRunning: data.sessionRunning,

        platformState: data.platformState,

        timestamp: Date.now()
      }
    );
  } catch (error) {
    connectionStatus.textContent = "Disconnected";
    console.error("Live data update failed:", error);
  }
}

function updateTimer() {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  sessionTimer.textContent =
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0");
}

// ASI CALCULATION FUNCTION
function calculateASI(leftKg, rightKg) {

  const totalKg = leftKg + rightKg;

  if (totalKg <= 0) {
    return 0;
  }

  const asi =
    2 *
    Math.abs(
      (leftKg - rightKg) /
      totalKg
    ) *
    100;

  return asi;
}

// RESET METRICS
function resetSessionMetrics() {

  sessionSampleCount = 0;
  asiSum = 0;
  maxASI = 0;
  balancedSampleCount = 0;

  currentASI.textContent = "--";
  averageASIDisplay.textContent = "--";
  maximumASIDisplay.textContent = "--";
  balancedTimeDisplay.textContent = "--";
  stabilityScore.textContent = "--";
}

// RECORD EACH SAMPLE
function recordSessionSample(leftKg, rightKg) {

  const totalKg = leftKg + rightKg;

  // Do not record empty platform readings
  if (totalKg < MINIMUM_USER_WEIGHT) {
    currentASI.textContent = "--";
    return;
  }

  const asi = calculateASI(leftKg, rightKg);

  currentASI.textContent = asi.toFixed(2);

  sessionSampleCount++;

  asiSum += asi;

  if (asi > maxASI) {
    maxASI = asi;
  }

  if (asi <= BALANCED_ASI_THRESHOLD) {
    balancedSampleCount++;
  }

  updateSessionMetricsDisplay()
}

// METRICS DISPLAY
function updateSessionMetricsDisplay() {

  if (sessionSampleCount === 0) {
    stabilityScore.textContent = "--";
    return;
  }

  const averageASI = asiSum / sessionSampleCount;

  const balancedTimePercent =
    (
      balancedSampleCount /
      sessionSampleCount
    ) * 100;

  /*
   System derived performance indicator.
   Not a clinically validated medical score.
  */

  const performanceScore =
    Math.max(
      0,
      Math.min(
        100,
        100 - averageASI
      )
    );

  averageASIDisplay.textContent =
    averageASI.toFixed(2);

  maximumASIDisplay.textContent =
    maxASI.toFixed(2);

  balancedTimeDisplay.textContent =
    balancedTimePercent.toFixed(1);

  stabilityScore.textContent =
    Math.round(performanceScore);
}

// GENERATE SESSOIN SUMMARY
function getSessionSummary() {

  if (sessionSampleCount === 0) {

    return {
      averageASI: 0,
      maxASI: 0,
      balancedTimePercent: 0,
      performanceScore: 0,
      durationSeconds: elapsedSeconds,
      sampleCount: 0
    };
  }

  const averageASI =
    asiSum / sessionSampleCount;

  const balancedTimePercent =
    (
      balancedSampleCount /
      sessionSampleCount
    ) * 100;

  const performanceScore =
    Math.max(
      0,
      Math.min(
        100,
        100 - averageASI
      )
    );

  return {
    averageASI:
      Number(averageASI.toFixed(2)),

    maxASI:
      Number(maxASI.toFixed(2)),

    balancedTimePercent:
      Number(
        balancedTimePercent.toFixed(2)
      ),

    performanceScore:
      Math.round(performanceScore),

    durationSeconds:
      elapsedSeconds,

    sampleCount:
      sessionSampleCount
  };
}

// Data logging
// SAVE COMPLETED SESSION
async function saveCompletedSession(
  sessionSummary
) {

  // Do not save empty sessions
  if (
    sessionSummary.sampleCount === 0
  ) {

    console.warn(
      "Session not saved because no valid samples were recorded."
    );

    return false;
  }


  // Patient must exist
  if (!currentPatientId) {

    console.error(
      "Session cannot be saved: no patient selected."
    );

    return false;
  }


  // Session timestamp must have
  // been generated when START was pressed
  if (!currentSessionTimestamp) {

    console.error(
      "Session cannot be saved: session timestamp missing."
    );

    return false;
  }


  /*
      Final Firebase path:

      patients/
        PATIENT004/
          sessions/
            balance/
              balance_rehabilitation/
                2026-09-03_14-25-32/
  */

  const sessionRef =
    ref(
      database,
      `patients/${currentPatientId}/sessions/balance/balance_rehabilitation/${currentSessionTimestamp}`
    );


  const syncedTime =
    new Date();


  const sessionData = {

    metadata: {

      display_name:
        "Balance Rehabilitation",

      patient_id:
        currentPatientId,

      patient_name:
        currentPatientName,

      session_type:
        "balance_rehabilitation",

      source:
        "ESP32 via WiFi",

      subsystem:
        "balance",

      synced_at:
        createLocalISOTime(
          syncedTime
        ),

      timestamp:
        currentSessionTimestamp
    },


    results: {

      duration_seconds:
        sessionSummary.durationSeconds,

      average_asi:
        sessionSummary.averageASI,

      max_asi:
        sessionSummary.maxASI,

      balanced_time_percent:
        sessionSummary.balancedTimePercent,

      performance_score:
        sessionSummary.performanceScore,

      sample_count:
        sessionSummary.sampleCount,

      balanced_asi_threshold:
        BALANCED_ASI_THRESHOLD
    }
  };


  await set(
    sessionRef,
    sessionData
  );


  console.log(
    "Session saved to Firebase:",
    {
      path:
        `patients/${currentPatientId}/sessions/balance/balance_rehabilitation/${currentSessionTimestamp}`,

      data:
        sessionData
    }
  );


  return true;
}

// START SESSION
document
  .getElementById("startButton")
  .addEventListener("click", async () => {

    const startButton =
      document.getElementById("startButton");

    // Patient must be selected
    if (!currentPatientId) {

      alert("Please select a patient before starting the session.");

      return;
    }

    try {
      startButton.disabled = true;
      startButton.textContent = "Starting...";

      const response = await fetch(
        `${ESP32_URL}/start`,
        {
          method: "POST"
        }
      );

      if (!response.ok) {
        throw new Error(
          `Start failed: ${response.status}`
        );
      }

      // New session starts from zero
      elapsedSeconds = 0;
      updateTimer();
      // Generate readable session identifier
      currentSessionTimestamp =
        createSessionTimestamp(
          new Date()
        );

      resetSessionMetrics();

      sessionRunningLocal = true;

      // Prevent changing patient
      // during active session
      patientSelect.disabled = true;
      showAddPatientButton.disabled = true;

      if (timerInterval) {
        clearInterval(timerInterval);
      }

      timerInterval = setInterval(() => {
        elapsedSeconds++;
        updateTimer();
      }, 1000);

      startButton.textContent =
        "Session Running";

      const stopButton =
        document.getElementById(
          "stopButton"
        );

      stopButton.textContent =
        "END SESSION";

      stopButton.disabled = false;

      console.log("Session started");

    } catch (error) {

      startButton.textContent =
        "START SESSION";

      startButton.disabled = false;

      console.error(
        "Unable to start session:",
        error
      );
    }
  });

// CALIBRATE
document
  .getElementById("calibrateButton")
  .addEventListener("click", async () => {

    const calibrateButton =
      document.getElementById(
        "calibrateButton"
      );

    try {
      calibrateButton.disabled = true;
      calibrateButton.textContent =
        "Calibrating...";

      const response = await fetch(
        `${ESP32_URL}/calibrate`,
        {
          method: "POST"
        }
      );

      if (response.status === 409) {

        calibrateButton.textContent =
          "Platform Not Empty";

        setTimeout(() => {
          calibrateButton.textContent =
            "CALIBRATE";
          calibrateButton.disabled = false;
        }, 2000);

        return;
      }

      if (!response.ok) {
        throw new Error(
          `Calibration failed: ${response.status}`
        );
      }

      calibrateButton.textContent =
        "Calibration Complete";

      setTimeout(() => {
        calibrateButton.textContent =
          "CALIBRATE";
        calibrateButton.disabled = false;
      }, 2000);

      console.log(
        "Calibration completed"
      );

    } catch (error) {

      calibrateButton.textContent =
        "Calibration Failed";

      setTimeout(() => {
        calibrateButton.textContent =
          "CALIBRATE";
        calibrateButton.disabled = false;
      }, 2000);

      console.error(
        "Unable to calibrate:",
        error
      );
    }
  });

// STOP SESSION
document
  .getElementById("stopButton")
  .addEventListener("click", async () => {

    const stopButton =
      document.getElementById("stopButton");

    const startButton =
      document.getElementById("startButton");

    try {
      stopButton.disabled = true;
      stopButton.textContent = "Ending...";

      const response = await fetch(
        `${ESP32_URL}/stop`,
        {
          method: "POST"
        }
      );

      if (!response.ok) {
        throw new Error(
          `Stop failed: ${response.status}`
        );
      }

      sessionRunningLocal = false;

      clearInterval(timerInterval);
      timerInterval = null;

      const sessionSummary = getSessionSummary();

      console.log(
        "Completed Session:",
        sessionSummary
      );

      // Keep completed duration visible
      stopButton.textContent =
        "Saving Session...";

      const sessionSaved =
        await saveCompletedSession(sessionSummary);

      currentSessionTimestamp = null;

      if (sessionSaved) {
        stopButton.textContent = "Session Saved";
      } else {
        stopButton.textContent = "Session Ended";
      }

      startButton.textContent =
        "START NEW SESSION";

      startButton.disabled = false;

      //Patient can now be changed
      patientSelect.disabled = false;
      showAddPatientButton.disabled = false;

      console.log("Session stopped");

    } catch (error) {

      stopButton.textContent =
        "END SESSION";

      stopButton.disabled = false;

      console.error(
        "Unable to stop session:",
        error
      );
    }
  });


// Load patient list from Firebase
loadPatients();

// Request ESP32 data every 500 ms
updateLiveData();

setInterval(updateLiveData, 1000);
