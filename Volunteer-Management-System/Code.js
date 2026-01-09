const SHEET_ID = "YOUR_SPREADSHEET_ID_HERE"; // Replace with your actual Sheet ID
const API_KEY = "YOUR_GEMINI_API_KEY_HERE"; // Replace with your actual API key

const TAB_TASKS = "Tasks_Master";
const TAB_VOLUNTEERS = "Volunteers_Raw";
const TAB_LOGS = "Assignments_Log";

function runVolunteerMatching() {
  console.time("ExecutionTime"); // Start timer
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const taskSheet = ss.getSheetByName(TAB_TASKS);
  const volSheet = ss.getSheetByName(TAB_VOLUNTEERS);
  const logSheet = ss.getSheetByName(TAB_LOGS);

  if (!taskSheet || !volSheet || !logSheet) {
    Logger.log("❌ ERROR: One or more Sheets are missing. Check names!");
    return;
  }

  // --- 1. READ TASKS ---
  const taskData = taskSheet.getDataRange().getValues();
  taskData.shift();

  let availableTasks = [];
  let taskIndices = {}; 

  taskData.forEach((row, index) => {
    let tID = row[0]; let tName = row[1]; let tDesc = row[2]; 
    let tSkills = row[3]; let tTime = row[5]; 
    let maxCap = row[6]; let curCount = row[7];
    
    if (curCount === "" || curCount === undefined) curCount = 0;

    if (curCount < maxCap) {
      availableTasks.push({
        id: tID,
        details: `ID: ${tID} | Task: ${tName} | Needs: ${tSkills} | Time: ${tTime}`
      });

      taskIndices[tID] = index + 2; 
    }
  });

  if (availableTasks.length === 0) {
    Logger.log("⚠️ No tasks available (All full or sheet empty)!");
    return;
  }

  // --- 2. READ VOLUNTEERS ---
  const volData = volSheet.getDataRange().getValues();
  
  const COL_NAME = 1; const COL_EMAIL = 2; const COL_WHATSAPP = 3;
  const COL_SKILLS = 4; const COL_EXP = 6; const COL_AVAIL = 7;
  const COL_STATUS = 8; 

  for (let i = 1; i < volData.length; i++) {
    let row = volData[i];

    // Skip if Name or Email is missing
    if (!row[COL_NAME] || !row[COL_EMAIL]) continue; 
    
    let status = row[COL_STATUS];

    if (status === "" || status === undefined) {
      
      let volunteerProfile = `Name: ${row[COL_NAME]}, Skills: ${row[COL_SKILLS]}, Exp: ${row[COL_EXP]}, Avail: ${row[COL_AVAIL]}`;

      Logger.log(`👉 Checking: ${row[COL_NAME]}...`); 

      // --- 3. ASK GEMINI ---
      let decision = callGemini(volunteerProfile, availableTasks);
      
      Logger.log(`🤖 Gemini Replied: ${JSON.stringify(decision)}`); 

      if (decision.taskId && decision.taskId !== "NO_MATCH") {
        
        let phone = cleanPhone(row[COL_WHATSAPP]);
        let msg = `Hi ${row[COL_NAME]}, Selected for: *${decision.taskName}*. Check Email!`;
        let waLink = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
        
        let emailStatus = "Pending";
        try {
           sendEmail(row[COL_EMAIL], row[COL_NAME], decision.taskName, decision.reasoning);
           emailStatus = "Email Sent ✅";
        } catch (e) {
           emailStatus = "Email Failed ❌";
           Logger.log("Email Error: " + e.toString());
        }

        logSheet.appendRow([
            row[COL_NAME], 
            row[COL_EMAIL], 
            decision.taskId, 
            decision.taskName, 
            decision.reasoning, 
            waLink, 
            emailStatus, 
            new Date()
        ]);

        volSheet.getRange(i + 1, COL_STATUS + 1).setValue("Assigned");
        Logger.log("✅ Success: Assigned");

        if (taskIndices[decision.taskId]) {
            let tRow = taskIndices[decision.taskId];
            let countCell = taskSheet.getRange(tRow, 8); 
            let newCount = countCell.getValue() + 1;
            countCell.setValue(newCount);
            
            let maxCap = taskSheet.getRange(tRow, 7).getValue();
            if (newCount >= maxCap) {
                taskSheet.getRange(tRow, 9).setValue("Full");
                // Remove from available array for next iteration
                availableTasks = availableTasks.filter(t => t.id !== decision.taskId);
            }
        }

      } else {
        let failReason = decision.errorType || "No Skill Match";
        Logger.log("❌ Failed Reason: " + failReason);
        
        volSheet.getRange(i + 1, COL_STATUS + 1).setValue("⚠️ " + failReason);
      }

      Utilities.sleep(10000); 
    }
  }
  console.timeEnd("ExecutionTime"); 
}

function sendEmail(email, name, task, reason) {
  if (!email || email.includes("@example.com")) return; 

  const subject = `🎉 You're Selected! Assignment: ${task}`;
  const htmlBody = `
    <h3>Hi ${name},</h3>
    <p>We are excited to tell you that based on your skills, you have been selected for the <strong>${task}</strong> team.</p>
    <p><strong>Why you?</strong> ${reason}</p>
    <br>
    <p>Please reply to this email to confirm your slot.</p>
    <p><em>- The Event Team</em></p>
  `;

  MailApp.sendEmail({
    to: email,
    subject: subject,
    htmlBody: htmlBody
  });
}

function cleanPhone(phone) {
  if (!phone) return "";
  let p = phone.toString().replace(/\D/g, ""); 
  if (p.length === 10) return "91" + p; 
  return p;
}

// --- AI FUNCTION ---
function callGemini(volunteer, tasks) {
  if (!API_KEY) {
    Logger.log("❌ ERROR: API Key is missing.");
    return { taskId: "NO_MATCH", errorType: "MISSING_KEY" };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
  
  const taskListString = tasks.map(t => t.details).join("\n");

  const prompt = `
    Act as a volunteer coordinator. Match this volunteer to the BEST available task.
    VOLUNTEER: ${volunteer}
    OPEN TASKS: ${taskListString}
    RULES:
    1. Match based on SKILLS first.
    2. If "Full Day", they fit Morning or Afternoon.
    3. Return "NO_MATCH" if nothing fits.
    RETURN JSON ONLY: { "taskId": "T-XXX", "taskName": "Name", "reasoning": "Why" }
  `;

  const payload = { "contents": [{ "parts": [{ "text": prompt }] }] };
  const options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true // This allows us to read the error message
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const json = JSON.parse(response.getContentText());
    
    // --- NEW: ERROR CATCHING BLOCK ---
    if (responseCode !== 200 || json.error) {
      // Log the ACTUAL error message from Google
      const actualError = json.error ? json.error.message : "Unknown Error";
      Logger.log("❌ API FAILURE: " + actualError); 
      return { taskId: "NO_MATCH", errorType: actualError };
    }

    if (!json.candidates) return { taskId: "NO_MATCH" };

    let text = json.candidates[0].content.parts[0].text;
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(text);

  } catch (e) {
    Logger.log("🚨 SCRIPT CRASH: " + e.toString());
    return { taskId: "NO_MATCH", errorType: "SCRIPT_CRASH" };
  }
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('⚡ Admin Tools')
      .addItem('♻️ Reset System for New Event', 'resetSystem')
      .addItem('🛠️ Run Debug Check', 'runDebugCheck') // Added Debug tool to menu
      .addToUi();
}

function resetSystem() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('⚠️ Confirm Reset', 'This will DELETE all data. Are you sure?', ui.ButtonSet.YES_NO);

  if (response == ui.Button.YES) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    const volSheet = ss.getSheetByName("Volunteers_Raw");
    if (volSheet.getLastRow() > 1) volSheet.deleteRows(2, volSheet.getLastRow() - 1);
    
    const logSheet = ss.getSheetByName("Assignments_Log");
    if (logSheet.getLastRow() > 1) logSheet.deleteRows(2, logSheet.getLastRow() - 1);
    
    const taskSheet = ss.getSheetByName("Tasks_Master");
    if (taskSheet.getLastRow() > 1) {
      let numRows = taskSheet.getLastRow() - 1;
      taskSheet.getRange(2, 8, numRows, 1).setValue(0);
      taskSheet.getRange(2, 9, numRows, 1).setValue("Open");
    }
    ui.alert('System Reset Complete! 🚀');
  }
}

function runDebugCheck() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const tSheet = ss.getSheetByName("Tasks_Master");
  const vSheet = ss.getSheetByName("Volunteers_Raw");
  
  if (!tSheet || !vSheet) {
    ui.alert("❌ Error: Sheets missing!");
    return;
  }
  ui.alert("✅ Sheets found! ready to run.");
}