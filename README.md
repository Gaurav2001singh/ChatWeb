# ChatWeb 💬

A real-time full-stack chat application inspired by WhatsApp, built using HTML, CSS, JavaScript, Node.js, Express.js, SQL Server, and Socket.IO.

---

## 🚀 Features

### Authentication

* User Registration
* User Login
* JWT Authentication
* Password Encryption using Bcrypt
* Profile Management
* Profile Picture Upload

### Real-Time Messaging

* One-to-One Chat
* Real-Time Message Delivery
* Real-Time Message Seen Status
* Online / Offline Users
* Last Seen Tracking
* Typing Indicators

### Contacts

* Add Contacts by Phone Number
* Edit Contact Names
* Contact List Management
* Unknown Numbers Displayed as Phone Numbers

### Status System

* Create Image Status
* Create Text Status
* View Status
* Status View Count
* Status Replies
* Delete Status
* 24-Hour Auto Expiry

### User Profile

* Change Username
* Update About Section
* Upload Profile Picture
* Remove Profile Picture

### Admin Panel

* Admin Dashboard
* User Management
* Chat Monitoring

---

## 🛠️ Tech Stack

### Frontend

* HTML5
* CSS3
* JavaScript (Vanilla JS)

### Backend

* Node.js
* Express.js
* Socket.IO
* JWT Authentication
* Multer

### Database

* Microsoft SQL Server

---

## 📁 Project Structure

```text
ChatWeb/
│
├── frontend/
│   ├── index.html
│   ├── accounts.html
│   ├── style.css
│   ├── script.js
│   └── img/
│
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── utils/
│   ├── server.js
│   └── upload.js
│
└── admin/
    ├── admin.html
    ├── admin.css
    └── admin.js
```

---

## ⚙️ Installation

### 1. Clone Repository

```bash
git clone https://github.com/Gaurav2001singh/ChatWeb.git
cd ChatWeb
```

### 2. Install Backend Dependencies

```bash
cd backend
npm install
```

### 3. Create .env File

```env
PORT=5000

JWT_SECRET=your_secret_key

DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_SERVER=your_server_name
DB_DATABASE=chatWeb

TOKEN_EXPIRES=7d
```

### 4. Start Backend

```bash
node server.js
```

### 5. Run Frontend

Open:

```text
frontend/index.html
```

or use Live Server.

---

## 🗄️ Database

Database: SQL Server

Main Tables:

* Users
* Contacts
* Chats
* ChatMembers
* Messages
* Status
* StatusViews
* StatusReplies

---

## 🔒 Security

* JWT Authentication
* Password Hashing (Bcrypt)
* Protected API Routes
* Environment Variables
* SQL Parameterized Queries

---

## 📸 Screenshots

Add screenshots of:

* Login Page
* Chat Interface
* Status Section
* Profile Page
* Admin Dashboard

---

## 📈 Future Improvements

* Voice Messages
* Video Calling
* Group Chats
* Message Reactions
* Dark / Light Theme
* Push Notifications
* End-to-End Encryption

---

## 👨‍💻 Developer

**Gaurav Singh**

Full Stack Developer

GitHub:
https://github.com/Gaurav2001singh

---

## 📄 License

This project is developed for learning and portfolio purposes.
