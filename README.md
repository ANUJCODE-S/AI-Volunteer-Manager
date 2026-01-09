# Intelligent Volunteer Allocation System 🤖🤝

An automated ecosystem designed to streamline volunteer management for large-scale events. This system uses **Google Apps Script** and the **Gemini API** to match volunteers to tasks based on skills, availability, and real-time constraints.

## 🚀 Features

* **Smart Matching:** Uses LLMs (Gemini) to semantically analyze volunteer profiles against task requirements.
* **Capacity Logic:** Automatically locks tasks when maximum capacity is reached to prevent over-allocation.
* **Automated Notifications:** Sends instant HTML emails and generates WhatsApp deep links upon assignment.
* **Volunteer Portal:** A web interface for volunteers to check status and download QR-code ID cards.

## 🛠️ Tech Stack

* **Middleware:** Google Apps Script (Serverless)
* **Database:** Google Sheets
* **AI Engine:** Google Gemini API
* **Frontend:** HTML5 / CSS (served via GAS `doGet`)

## ⚙️ How It Works

1.  **Input:** Volunteers fill a Google Form; data lands in a "Raw" Sheet.
2.  **Process:** The script runs a batch job:
    * Checks if the target task is full.
    * Sends volunteer data + Open Tasks to Gemini.
    * Gemini returns a JSON decision with reasoning.
3.  **Output:** * Sheet is updated.
    * Email/WhatsApp sent.
    * Web Portal reflects new status.

## 🔧 Setup Guide

1.  Create a Google Sheet with tabs: `Tasks_Master`, `Volunteers_Raw`, `Assignments_Log`.
2.  Open **Extensions > Apps Script**.
3.  Copy the code from `Code.js` into the script editor.
4.  Copy the code from `Index.html` into a new HTML file in the editor.
5.  Add your **Gemini API Key** in Project Properties.
6.  Deploy as a Web App.

## 🛡️ License

This project is open-source.
