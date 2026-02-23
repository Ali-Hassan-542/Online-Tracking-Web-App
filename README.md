# SafeTrack – Consent-Based Location Tracking System

![License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Frontend](https://img.shields.io/badge/Frontend-HTML%20%7C%20CSS%20%7C%20JavaScript-blue)
![Backend](https://img.shields.io/badge/Backend-PHP%20%7C%20MySQL-green)
![Framework](https://img.shields.io/badge/UI-Bootstrap%205-purple)
![Map](https://img.shields.io/badge/Maps-Leaflet-success)

SafeTrack is a **privacy-focused location tracking demonstration system** designed to showcase how modern web technologies can be used to build an ethical and transparent tracking platform.

The goal of this project is not to secretly track people but to demonstrate how **location sharing systems should be built responsibly**, where the person being tracked is fully aware and provides explicit consent before any data is shared.

This project was created as a **full-stack portfolio project** that highlights frontend design, backend architecture, REST API integration, and privacy-aware software development practices.

The system includes:

* A clean and modern user interface
* A consent-based permission system
* A real-time map dashboard
* Simulated location updates
* Optional backend API integration

Because of its structure, SafeTrack can be used as:

* A learning project
* A portfolio project for developers
* A university submission project
* A base architecture for ethical location-sharing apps

---

# Project Objectives

The main objective of SafeTrack is to demonstrate that **technology should respect privacy** while still providing useful functionality.

Many tracking systems on the internet ignore transparency and user consent. SafeTrack takes the opposite approach and ensures that every action in the system is built around **user permission, control, and awareness**.

This project focuses on:

• Ethical software design
• User consent workflows
• Real-time geolocation visualization
• Frontend + backend integration
• Privacy-first architecture

---

# Key Features

## 1. Consent-Based Tracking System

The most important feature of SafeTrack is its **consent-first workflow**.
Before any tracking can begin, the system requires the requesting user to send a tracking request and the receiving user must explicitly agree.

The process includes:

* Entering contact information
* Selecting relationship context
* Choosing permission scope
* Accepting legal declarations

Only after these steps are completed will the system allow tracking to begin.

This demonstrates how real-world applications should enforce **transparent and lawful user permissions**.

---

# 2. Interactive Map Dashboard

SafeTrack provides a clean and responsive dashboard that displays location information on an interactive map.

The map system is powered by **Leaflet.js** with **OpenStreetMap** tiles, allowing users to:

* View last known location
* Track simulated movement
* Zoom and pan across locations
* See contact markers
* Observe updates in real time

This dashboard serves as the main control center of the application.

---

# 3. Consent Management Panel

The system includes a dedicated section for managing permissions.

Users can:

• View active tracking permissions
• Review pending requests
• Identify expired permissions
• Revoke tracking access
• Inspect tracking details

This feature emphasizes transparency and gives users full control over how their location information is used.

---

# 4. Fully Responsive Design

SafeTrack is built using **Bootstrap 5**, which ensures the interface works smoothly across different devices and screen sizes.

The layout adapts automatically for:

* Desktop screens
* Tablets
* Mobile phones
* Small displays

This makes the project suitable for modern web usage and demonstrates responsive design practices.

---

# 5. Local Demo Mode (No Backend Required)

To make testing easy, SafeTrack includes a **local simulation mode**.

In this mode:

* No server is required
* No data is transmitted externally
* All information is stored in browser localStorage

This allows developers, instructors, and reviewers to explore the project instantly without setting up a database or server.

---

# 6. Optional Backend API

For a more realistic implementation, SafeTrack includes a backend built with **PHP and MySQL**.

The backend provides:

• REST API endpoints
• Database persistence
• Consent storage
• Location data storage
• API communication with frontend

Developers can easily switch between demo mode and backend mode by editing a small configuration in the frontend code.

---

# Technology Stack

## Frontend

The frontend focuses on modern, lightweight web technologies that are widely supported across browsers.

Technologies used include:

HTML5
Used to structure the entire web application and layout.

CSS3
Provides styling, layout design, and responsive formatting.

JavaScript (ES6)
Handles all interactive functionality including maps, forms, and state management.

Bootstrap 5
Provides a responsive grid system and UI components.

Font Awesome
Used for icons and interface visuals.

---

# Mapping Technology

SafeTrack integrates mapping functionality using open-source tools.

Leaflet.js
A lightweight and powerful JavaScript library for building interactive maps.

OpenStreetMap
Provides free map tile data without requiring commercial licenses or tracking users.

This combination ensures the project remains **privacy-friendly and open source**.

---

# Backend Technologies (Optional)

The backend architecture demonstrates a simple yet scalable API design.

PHP
Handles server-side logic and API routing.

MySQL
Stores consent records, contact details, and location history.

PDO
Provides secure database communication using prepared statements.

REST API
Allows the frontend to communicate with backend services.

---

# Project Structure

Below is the simplified folder layout of the project.

```
SafeTrack
│
├── tracking.html
├── style.css
├── script.js
├── api.js
├── database.js
│
├── images
│   ├── Image-1.jpg
│   └── Image-2.jpg
│
└── backend
    ├── api.php
    ├── config.php
    ├── db.php
    ├── helpers.php
    ├── providers.php
    ├── schema.sql
    └── README.md
```

Each file has a specific role within the project:

tracking.html
Main interface of the application.

style.css
Custom styling and visual design.

script.js
Handles UI interactions and map updates.

api.js
Manages communication between frontend and backend.

database.js
Simulates a database using local storage.

backend folder
Contains server-side code and database configuration.

---

# Installation Guide

## Running the Project in Demo Mode

The easiest way to explore SafeTrack is to run it without a backend.

Step 1
Download or clone the repository.

```
git clone https://github.com/yourusername/safetrack.git
```

Step 2
Open the project folder.

Step 3
Double click:

```
tracking.html
```

The application will run instantly in your browser.

All data will be saved locally.

---

# Backend Setup (Optional)

If you want to use the full backend system, follow these steps.

Step 1
Install a local development server such as:

XAMPP
WAMP
MAMP

Step 2
Create a new MySQL database.

Step 3
Import the schema file.

```
backend/schema.sql
```

Step 4
Edit database credentials in:

```
backend/config.php
```

Step 5
Start Apache and MySQL.

Step 6
Update the frontend API URL in `api.js`.

---

# Demo Usage Guide

Once the system is running, you can explore the features in the following way.

### Request Tracking

1 Open the tracking page
2 Enter a phone number
3 Select relationship
4 Accept legal statements
5 Send request

### Manage Consents

The consent page allows you to monitor the status of requests and control tracking permissions.

### View Dashboard

The dashboard provides a visual overview of all tracked contacts and their last known location.

### Simulate Movement

A simulation button allows the system to update coordinates so that you can observe map changes.

---

# Privacy and Ethical Notice

Location tracking is a sensitive capability and must always be handled responsibly.

This project is intended strictly for:

* learning
* demonstration
* ethical development practice

Tracking someone without their knowledge or consent may be illegal in many jurisdictions.

Developers who build systems like this must ensure they follow:

• privacy laws
• data protection rules
• user consent policies

---

# Screenshots

You can add screenshots of the application inside the images folder to help users understand how the project works.

Example:

images/home.png
images/dashboard.png
images/tracking.png

Screenshots significantly improve the quality of a GitHub repository.

---

# Contributing

Contributions are welcome and appreciated.

If you would like to improve SafeTrack, you can follow these steps.

1 Fork the repository
2 Create a new branch
3 Implement your changes
4 Commit updates
5 Push to your fork
6 Submit a pull request

Please ensure that your code follows the existing style and structure.

---

# License

This project is released under the MIT License.

The MIT license allows developers to freely use, modify, and distribute the software as long as the original copyright notice is included.

---

# Author

Ali Hassan

This project was developed as a demonstration of ethical technology and privacy-focused system design.
