# NLC-Integrated-Gatepass-System
Here is a highly detailed, professional README description for your GitHub repository. It covers everything from the architecture and database schema to installation and core features. 

***

# 🏢 NLC Integrated Gate Pass System (IGPS)

## 📖 Project Overview
The **Integrated Gate Pass System (IGPS)** is a comprehensive, secure, and role-based web application tailored for NLC India Limited (NLCIL). It is designed to digitize, monitor, and streamline the movement of personnel, visitors, and materials across the organization's premises. By transitioning from manual paperwork to a centralized digital solution, IGPS ensures tighter security, faster approvals, and a permanent, auditable log of all facility access.

## ✨ Core Features & Modules

### 1. Role-Based Access Control (RBAC)
The system is built around four distinct user roles, each with its own customized dashboard and permission scope:
- **Employees:** Can request Gate Passes for themselves, track the status of their requests, and view their pass history.
- **Security Personnel:** Stationed at checkpoints. They view approved passes, verify identities, and log the exact entry/exit times of individuals and materials.
- **Managers:** Responsible for reviewing, approving, or rejecting pass requests submitted by employees within their department.
- **Administrators:** Have full oversight of the system. They can manage user accounts, oversee all pass activities, and extract system-wide logs.

### 2. Comprehensive Pass Management
The system handles three primary categories of movement:
- 🎫 **Gate Pass:** Facilitates short-term exits and entries for internal employees during working hours.
- 🧑‍💼 **Visitor Pass:** Allows external guests to enter the premises. It captures visitor names, contact details, representing organizations, and expected entry/exit times.
- 📦 **Material Pass:** Tracks the inward and outward movement of company assets. It logs material descriptions, quantities, movement direction, vehicle numbers (if applicable), and purpose.

### 3. Real-Time Tracking & Status Workflow
Every pass request goes through a strict lifecycle: `Pending` ➔ `Approved` / `Rejected` ➔ `In Transit` ➔ `Completed`. Users can track their requests in real-time, and security guards have immediate access to approved lists to prevent unauthorized access.

### 4. Modern, Responsive UI
The frontend is built from the ground up using custom Vanilla CSS (no heavy frameworks). It features a clean, glassmorphism-inspired design, utilizing a highly tailored and elegant color palette. The UI is fully responsive and optimized for both desktop management and mobile security checkpoints.

---

## 🛠️ Technology Stack & Architecture

### **Frontend**
- **Languages:** HTML5, JavaScript (ES6+)
- **Styling:** Custom Vanilla CSS utilizing a CSS Variable-driven design system for easy theme switching and maintenance. 

### **Backend**
- **Framework:** Python with **Flask** for lightweight, robust RESTful API routing and server-side logic.
- **Authentication:** Custom session management using JWT-like secure tokens and hashed user passwords.
- **Database ORM:** **SQLAlchemy** is used to securely map Python objects to the database, preventing SQL injection and simplifying data management.

### **Database**
- **RDBMS:** **MySQL** via the `PyMySQL` driver. 
- **Schema Highlights:**
  - `Users` Table: Stores credentials, roles, and departmental info.
  - `GatePass`, `VisitorPass`, `MaterialPass` Tables: Separate normalized tables storing the specific metadata for each pass type, all linked via Foreign Keys to the requesting user.

### **Deployment / Networking**
- **Tunneling:** **ngrok** is integrated directly into the Python application to expose the local Flask server to the internet securely, allowing remote access without complex firewall configurations.

---

## ⚙️ Installation & Setup Guide

### Prerequisites
- Python 3.8+
- MySQL Server (running locally on port 3306)
- ngrok account and auth token (for live deployment)

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/NLC-GatePass-System.git
cd NLC-GatePass-System
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Database Configuration
Ensure MySQL is running. Create a `.env` file in the root directory and configure your credentials:
```env
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=igps_db
```

### 4. Initialize the Database
Run the setup script to create the required tables and seed the database with default test accounts:
```bash
python init_db.py
```

### 5. Start the Application
Run the Flask server. The application will automatically spin up an ngrok tunnel for external access.
```bash
python app.py
```
*The terminal will display both your `localhost` address and the live `ngrok` URL.*

---

## 🛡️ Security Considerations
- **Password Hashing:** Passwords are never stored in plain text.
- **Environment Variables:** Sensitive data (like DB passwords and secret keys) are kept out of source control using `.env` files.
- **Input Validation:** Both client-side (HTML5/JS) and server-side validation are enforced to prevent malformed data entry.
